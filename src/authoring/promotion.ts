import { randomUUID } from 'node:crypto';
import { BlobPreconditionFailedError, copy, get, head, put } from '@vercel/blob';
import type { Principal } from '../auth/model.js';
import { database } from '../persistence/postgres.js';
import { canonicalStoryBytes, commitBlock, type CommitBlock } from './revisions.js';
import type { NormalizedStory } from '../model/normalized.js';
import { draftBlobToken } from './asset-service.js';

interface ManifestFile { path: string; size: number; sha256: string; contentType: string }
interface Candidate {
  workspaceId: string; storyId: string; organizationId: string; baseEtag: string; status: 'active' | 'committed' | 'closed' | 'conflict';
  currentRevisionId: string; acknowledgedRevisionId?: string; baseStoragePrefix: string;
  document: NormalizedStory; digest: string; diagnostics: unknown[]; manifest: ManifestFile[];
  uploadedAssets: { logicalPath: string; storageKey: string; digest: string; mediaType: string }[];
  hasPendingChanges: boolean;
}

export class PromotionError extends Error {
  constructor(public code: CommitBlock | 'not_found' | 'storage_failure', message: string) { super(message); }
}

export interface PromotionResult { releaseId: string; revision: string; readerUrl: string }

async function candidate(workspaceId: string, revisionId: string): Promise<Candidate> {
  const sql = database();
  if (!sql) throw new PromotionError('storage_failure', 'Authoring persistence is unavailable.');
  const rows = await sql<Candidate[]>`
    select dw.id as "workspaceId", dw.story_id as "storyId", s.organization_id as "organizationId",
      dw.base_etag as "baseEtag", dw.status, dw.current_revision_id as "currentRevisionId",
      dw.preview_acknowledged_revision_id as "acknowledgedRevisionId", pr.storage_prefix as "baseStoragePrefix",
      jsonb_array_length(dw.working_operations_json) > 0 as "hasPendingChanges",
      dr.document_json as document, dr.document_digest as digest, dr.validation_json as diagnostics, dr.manifest_json as manifest,
      coalesce((select jsonb_agg(jsonb_build_object('logicalPath', ra.logical_path, 'storageKey', a.storage_key,
        'digest', a.digest, 'mediaType', a.media_type)) from revision_assets ra join assets a on a.id = ra.asset_id
        where ra.revision_id = dr.id and a.scan_status = 'approved' and a.retired_at is null), '[]'::jsonb) as "uploadedAssets"
    from draft_workspaces dw join stories s on s.id = dw.story_id
    join production_releases pr on pr.id = dw.base_release_id
    join draft_revisions dr on dr.id = ${revisionId}::uuid and dr.workspace_id = dw.id
    where dw.id = ${workspaceId}::uuid`;
  if (!rows[0]) throw new PromotionError('not_found', 'Workspace revision not found.');
  return rows[0];
}

export async function promoteWorkspace(
  workspaceId: string,
  revisionId: string,
  actor: Principal & { accountId: string },
  token: string,
): Promise<PromotionResult> {
  const item = await candidate(workspaceId, revisionId);
  const current = await head(`${item.storyId}/story.json`, { token });
  const blocked = commitBlock({
    workspaceStatus: item.status, currentRevisionId: item.currentRevisionId,
    acknowledgedRevisionId: item.acknowledgedRevisionId, baseEtag: item.baseEtag,
    productionEtag: current.etag, revisionValid: !item.diagnostics.some(issue => (issue as { severity?: string }).severity === 'error'),
    hasPendingChanges: item.hasPendingChanges,
  }, revisionId);
  if (blocked) throw new PromotionError(blocked, blocked === 'revision_conflict' ? 'Production changed after this workspace was created.' : 'The draft is not ready to commit.');

  const sql = database()!;
  const attemptId = randomUUID();
  const releaseId = randomUUID();
  await sql`
    insert into commit_attempts (id, workspace_id, revision_id, actor_id, expected_etag, status, release_id)
    values (${attemptId}, ${workspaceId}, ${revisionId}, ${actor.accountId}, ${item.baseEtag}, 'pending', ${releaseId})`;
  const releasePrefix = `_releases/${item.storyId}/${releaseId}/`;
  const assets = item.manifest.filter(file => file.path !== 'story.json');
  const storyBytes = canonicalStoryBytes(item.document);
  try {
    for (const file of assets) {
      const uploaded = item.uploadedAssets.find(asset => asset.logicalPath === file.path);
      if (uploaded) {
        if (uploaded.digest !== file.sha256 || uploaded.mediaType !== file.contentType) throw new PromotionError('invalid_revision', `Draft asset ${file.path} does not match the revision manifest.`);
        const object = await get(uploaded.storageKey, { access: 'private', token: draftBlobToken(), useCache: false });
        if (!object || object.statusCode !== 200) throw new PromotionError('invalid_revision', `Draft asset ${file.path} is unavailable.`);
        await put(`${releasePrefix}${file.path}`, object.stream, {
          access: 'public', token, addRandomSuffix: false, allowOverwrite: false, contentType: file.contentType, cacheControlMaxAge: 60,
        });
      } else await copy(`${item.baseStoragePrefix}${file.path}`, `${releasePrefix}${file.path}`, {
        access: 'public', token, addRandomSuffix: false, allowOverwrite: false, contentType: file.contentType, cacheControlMaxAge: 60,
      });
    }
    await put(`${releasePrefix}story.json`, Buffer.from(storyBytes), {
      access: 'public', token, addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json', cacheControlMaxAge: 60,
    });
    for (const file of assets) await copy(`${releasePrefix}${file.path}`, `${item.storyId}/${file.path}`, {
      access: 'public', token, addRandomSuffix: false, allowOverwrite: true, contentType: file.contentType, cacheControlMaxAge: 60,
    });
    const published = await put(`${item.storyId}/story.json`, Buffer.from(storyBytes), {
      access: 'public', token, addRandomSuffix: false, allowOverwrite: true, ifMatch: item.baseEtag,
      contentType: 'application/json', cacheControlMaxAge: 60,
    });
    await sql.begin(async transaction => {
      const locked = await transaction<{ current_revision_id: string; preview_acknowledged_revision_id: string; status: string }[]>`
        select current_revision_id, preview_acknowledged_revision_id, status from draft_workspaces where id = ${workspaceId}::uuid for update`;
      if (locked[0]?.current_revision_id !== revisionId || locked[0]?.preview_acknowledged_revision_id !== revisionId || locked[0]?.status !== 'active') {
        throw new Error('Workspace state changed during promotion; reconciliation is required.');
      }
      await transaction`
        insert into production_releases (id, story_id, parent_id, etag, manifest_json, document_digest, storage_prefix, actor_id)
        select ${releaseId}, ${item.storyId}, production_release_id, ${published.etag}, ${transaction.json(JSON.parse(JSON.stringify(item.manifest)))},
          ${item.digest}, ${releasePrefix}, ${actor.accountId} from stories where id = ${item.storyId}::uuid`;
      await transaction`update stories set production_release_id = ${releaseId}, production_etag = ${published.etag}, updated_at = now() where id = ${item.storyId}::uuid`;
      await transaction`update draft_workspaces set status = 'committed', updated_at = now() where id = ${workspaceId}::uuid`;
      await transaction`update commit_attempts set status = 'promoted', resulting_etag = ${published.etag}, completed_at = now() where id = ${attemptId}`;
      await transaction`
        insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
        values (${randomUUID()}, ${item.organizationId}, ${actor.accountId}, 'workspace.commit', 'release', ${releaseId},
          ${transaction.json({ workspaceId, revisionId, etag: published.etag })})`;
    });
    return { releaseId, revision: published.etag, readerUrl: `/s/${item.storyId}` };
  } catch (error) {
    if (error instanceof PromotionError) {
      await sql`update commit_attempts set status = 'failed', error_code = ${error.code}, completed_at = now() where id = ${attemptId}`;
      throw error;
    }
    const conflict = error instanceof BlobPreconditionFailedError;
    await sql`update commit_attempts set status = ${conflict ? 'conflict' : 'reconciliation_required'}, error_code = ${conflict ? 'revision_conflict' : 'promotion_failed'}, completed_at = now() where id = ${attemptId}`;
    if (conflict) {
      await sql`update draft_workspaces set status = 'conflict', preview_acknowledged_revision_id = null, updated_at = now() where id = ${workspaceId}::uuid`;
      throw new PromotionError('revision_conflict', 'Production changed during promotion.');
    }
    throw error;
  }
}

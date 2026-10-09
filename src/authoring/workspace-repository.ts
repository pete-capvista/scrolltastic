import { createHash, randomUUID } from 'node:crypto';
import { get } from '@vercel/blob';
import type { Principal } from '../auth/model.js';
import { database } from '../persistence/postgres.js';
import { validatedRevision } from './revisions.js';
import { replayRebaseOperations } from './revisions.js';

export interface WorkspaceSummary {
  id: string;
  storyId: string;
  baseEtag: string;
  currentRevisionId: string;
  previewAcknowledgedRevisionId?: string;
  hasPendingChanges: boolean;
  status: 'active' | 'committed' | 'closed' | 'conflict';
}

function requiredDatabase() {
  const sql = database();
  if (!sql) throw new Error('Authoring persistence is unavailable.');
  return sql;
}

export async function createOrResumeWorkspace(storyId: string, actor: Principal & { accountId: string }, blobToken: string): Promise<WorkspaceSummary> {
  const sql = requiredDatabase();
  const rows = await sql<{ production_release_id: string; production_etag: string; manifest_json: { path: string; size: number; sha256: string; contentType: string }[] }[]>`
    select s.production_release_id, s.production_etag, pr.manifest_json
    from stories s join production_releases pr on pr.id = s.production_release_id
    where s.id = ${storyId}::uuid and s.status = 'active'`;
  if (!rows[0]?.production_etag) throw new Error('The production story has not been inventoried.');
  const stored = await get(`${storyId}/story.json`, { access: 'public', token: blobToken, useCache: false });
  if (!stored || stored.statusCode !== 200) throw new Error('The production story is unavailable.');
  const content = validatedRevision(await new Response(stored.stream).text());
  const storyFile = { path: 'story.json', size: content.bytes.byteLength, sha256: content.digest, contentType: 'application/json' };
  const manifest = [...rows[0].manifest_json.filter(file => file.path !== 'story.json'), storyFile]
    .sort((left, right) => left.path.localeCompare(right.path));

  return sql.begin(async transaction => {
    await transaction`select pg_advisory_xact_lock(hashtext(${`${storyId}:${actor.accountId}`}))`;
    const existing = await transaction<WorkspaceSummary[]>`
      select id, story_id as "storyId", base_etag as "baseEtag", current_revision_id as "currentRevisionId",
        preview_acknowledged_revision_id as "previewAcknowledgedRevisionId",
        jsonb_array_length(working_operations_json) > 0 as "hasPendingChanges", status
      from draft_workspaces where story_id = ${storyId}::uuid and owner_id = ${actor.accountId}::uuid and status = 'active'`;
    if (existing[0]) return existing[0];
    const workspaceId = randomUUID();
    const revisionId = randomUUID();
    await transaction`
      insert into draft_workspaces (id, story_id, base_release_id, base_etag, owner_id, status,
        working_document_json, working_manifest_json, working_document_digest, working_validation_json)
      values (${workspaceId}, ${storyId}, ${rows[0].production_release_id}, ${rows[0].production_etag}, ${actor.accountId}, 'active',
        ${transaction.json(JSON.parse(JSON.stringify(content.document)))}, ${transaction.json(manifest)}, ${content.digest},
        ${transaction.json(JSON.parse(JSON.stringify(content.diagnostics)))})`;
    await transaction`
      insert into draft_revisions
        (id, workspace_id, document_json, manifest_json, document_digest, validation_json, created_by)
      values (${revisionId}, ${workspaceId}, ${transaction.json(JSON.parse(JSON.stringify(content.document)))}, ${transaction.json(manifest)},
        ${content.digest}, ${transaction.json(JSON.parse(JSON.stringify(content.diagnostics)))}, ${actor.accountId})`;
    await transaction`update draft_workspaces set current_revision_id = ${revisionId},
      working_document_json = ${transaction.json(JSON.parse(JSON.stringify(content.document)))}, working_manifest_json = ${transaction.json(manifest)},
      working_document_digest = ${content.digest}, working_validation_json = ${transaction.json(JSON.parse(JSON.stringify(content.diagnostics)))}
      where id = ${workspaceId}`;
    await transaction`
      insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
      select ${randomUUID()}, s.organization_id, ${actor.accountId}, 'workspace.create', 'workspace', ${workspaceId},
        ${transaction.json({ storyId, baseEtag: rows[0].production_etag })}
      from stories s where s.id = ${storyId}::uuid`;
    return { id: workspaceId, storyId, baseEtag: rows[0].production_etag, currentRevisionId: revisionId, hasPendingChanges: false, status: 'active' };
  });
}

export async function workspaceSummary(workspaceId: string): Promise<WorkspaceSummary | undefined> {
  const rows = await requiredDatabase()<WorkspaceSummary[]>`
    select id, story_id as "storyId", base_etag as "baseEtag", current_revision_id as "currentRevisionId",
      preview_acknowledged_revision_id as "previewAcknowledgedRevisionId",
      jsonb_array_length(working_operations_json) > 0 as "hasPendingChanges", status
    from draft_workspaces where id = ${workspaceId}::uuid`;
  return rows[0];
}

export async function revisionDocument(workspaceId: string, revisionId: string): Promise<{ document: unknown; digest: string } | undefined> {
  const rows = await requiredDatabase()<{ document: unknown; digest: string }[]>`
    select case when dw.current_revision_id = dr.id then dw.working_document_json else dr.document_json end as document,
      case when dw.current_revision_id = dr.id then dw.working_document_digest else dr.document_digest end as digest
    from draft_revisions dr join draft_workspaces dw on dw.id = dr.workspace_id
    where dr.id = ${revisionId}::uuid and dr.workspace_id = ${workspaceId}::uuid`;
  return rows[0];
}

export interface RevisionSummary { id: string; parentId?: string; digest: string; createdAt: string; operations?: unknown }

export async function listRevisions(workspaceId: string): Promise<RevisionSummary[]> {
  return requiredDatabase()<RevisionSummary[]>`
    select id, parent_id as "parentId", document_digest as digest, created_at as "createdAt", operations_json as operations
    from draft_revisions where workspace_id = ${workspaceId}::uuid order by created_at desc, id desc`;
}

export async function restoreRevision(workspaceId: string, sourceRevisionId: string, actor: Principal & { accountId: string }): Promise<string> {
  const sql = requiredDatabase();
  return sql.begin(async transaction => {
    const workspaces = await transaction<{ current_revision_id: string; status: string }[]>`
      select current_revision_id, status from draft_workspaces where id = ${workspaceId}::uuid for update`;
    if (workspaces[0]?.status !== 'active') throw new Error('Only an active workspace can restore a revision.');
    const sources = await transaction<{ document_json: unknown; manifest_json: unknown; document_digest: string; validation_json: unknown }[]>`
      select document_json, manifest_json, document_digest, validation_json from draft_revisions
      where id = ${sourceRevisionId}::uuid and workspace_id = ${workspaceId}::uuid`;
    if (!sources[0]) throw new Error('The source revision does not belong to this workspace.');
    const revisionId = randomUUID();
    await transaction`
      insert into draft_revisions
        (id, workspace_id, parent_id, document_json, manifest_json, document_digest, validation_json, operations_json, created_by)
      values (${revisionId}, ${workspaceId}, ${workspaces[0].current_revision_id}, ${transaction.json(sources[0].document_json as never)},
        ${transaction.json(sources[0].manifest_json as never)}, ${sources[0].document_digest},
        ${transaction.json(sources[0].validation_json as never)}, ${transaction.json({ type: 'restore', sourceRevisionId })}, ${actor.accountId})`;
    await transaction`
      update draft_workspaces set current_revision_id = ${revisionId}, working_document_json = ${transaction.json(sources[0].document_json as never)},
        working_manifest_json = ${transaction.json(sources[0].manifest_json as never)}, working_document_digest = ${sources[0].document_digest},
        working_validation_json = ${transaction.json(sources[0].validation_json as never)}, working_operations_json = '[]'::jsonb,
        preview_acknowledged_revision_id = null, updated_at = now()
      where id = ${workspaceId}::uuid`;
    return revisionId;
  });
}

export async function revisionPackageEntry(workspaceId: string, revisionId: string, path: string): Promise<
  | { kind: 'document'; document: unknown; digest: string }
  | { kind: 'asset'; storagePath: string; contentType: string; digest: string; storage: 'production' | 'draft' }
  | undefined
> {
  const rows = await requiredDatabase()<{
    document_json: unknown; document_digest: string; manifest_json: { path: string; contentType: string; sha256: string }[];
    storage_prefix: string; is_working_draft: boolean;
  }[]>`
    select case when dw.current_revision_id = dr.id then dw.working_document_json else dr.document_json end as document_json,
      case when dw.current_revision_id = dr.id then dw.working_document_digest else dr.document_digest end as document_digest,
      case when dw.current_revision_id = dr.id then dw.working_manifest_json else dr.manifest_json end as manifest_json,
      pr.storage_prefix,
      (dw.current_revision_id = dr.id and jsonb_array_length(dw.working_operations_json) > 0) as is_working_draft
    from draft_revisions dr join draft_workspaces dw on dw.id = dr.workspace_id
    join production_releases pr on pr.id = dw.base_release_id
    where dr.id = ${revisionId}::uuid and dr.workspace_id = ${workspaceId}::uuid`;
  const row = rows[0];
  if (!row) return undefined;
  if (path === 'story.json') return { kind: 'document', document: row.document_json, digest: row.document_digest };
  const file = row.manifest_json.find(item => item.path === path);
  if (!file) return undefined;
  const draftAssets = await requiredDatabase()<{ storage_path: string; content_type: string; digest: string }[]>`
    select a.storage_key as storage_path, a.media_type as content_type, a.digest
    from revision_assets ra join assets a on a.id = ra.asset_id
    where ra.revision_id = ${revisionId}::uuid and ra.logical_path = ${path}
      and a.workspace_id = ${workspaceId}::uuid and a.scan_status = 'approved' and a.retired_at is null`;
  const draft = draftAssets[0];
  if (draft) return { kind: 'asset', storagePath: draft.storage_path, contentType: draft.content_type, digest: draft.digest, storage: 'draft' };
  if (row.is_working_draft) {
    const workingAssets = await requiredDatabase()<{ storage_path: string; content_type: string; digest: string }[]>`
      select a.storage_key as storage_path, a.media_type as content_type, a.digest
      from assets a
      where a.workspace_id = ${workspaceId}::uuid and a.logical_path = ${path}
        and a.digest = ${file.sha256} and a.media_type = ${file.contentType}
        and a.scan_status = 'approved' and a.retired_at is null`;
    const working = workingAssets[0];
    if (working) return { kind: 'asset', storagePath: working.storage_path, contentType: working.content_type, digest: working.digest, storage: 'draft' };
  }
  return { kind: 'asset', storagePath: `${row.storage_prefix}${path}`, contentType: file.contentType, digest: file.sha256, storage: 'production' };
}

export async function acknowledgePreview(workspaceId: string, revisionId: string, actor: Principal & { accountId: string }): Promise<void> {
  const sql = requiredDatabase();
  await sql.begin(async transaction => {
    const updated = await transaction`
      update draft_workspaces set preview_acknowledged_revision_id = ${revisionId}, updated_at = now()
      where id = ${workspaceId}::uuid and current_revision_id = ${revisionId}::uuid and status = 'active'
        and jsonb_array_length(working_operations_json) = 0
      returning story_id`;
    if (!updated[0]) throw new Error('Only the current active revision can be acknowledged.');
    await transaction`
      insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
      select ${randomUUID()}, s.organization_id, ${actor.accountId}, 'preview.acknowledge', 'revision', ${revisionId},
        ${transaction.json({ workspaceId })}
      from stories s where s.id = ${updated[0].story_id}`;
  });
}

export async function createTestTitleRevision(workspaceId: string, title: string, actor: Principal & { accountId: string }): Promise<{ revisionId: string; diff: unknown }> {
  if (process.env.SCROLLTASTIC_ENABLE_TEST_MUTATIONS !== 'true') throw new Error('Test mutations are disabled.');
  if (!title.trim() || title.length > 200) throw new Error('The test title must contain 1–200 characters.');
  const sql = requiredDatabase();
  return sql.begin(async transaction => {
    const rows = await transaction<{ current_revision_id: string; status: string; document_json: Record<string, unknown>; manifest_json: { path: string; size: number; sha256: string; contentType: string }[] }[]>`
      select dw.current_revision_id, dw.status, dr.document_json, dr.manifest_json
      from draft_workspaces dw join draft_revisions dr on dr.id = dw.current_revision_id
      where dw.id = ${workspaceId}::uuid for update of dw`;
    if (rows[0]?.status !== 'active') throw new Error('Only an active workspace can create a revision.');
    const before = String(rows[0].document_json.title ?? '');
    const content = validatedRevision({ ...rows[0].document_json, title });
    const manifest = rows[0].manifest_json.map(file => file.path === 'story.json'
      ? { ...file, size: content.bytes.byteLength, sha256: content.digest }
      : file);
    const revisionId = randomUUID();
    const diff = { path: '/title', before, after: title };
    await transaction`
      insert into draft_revisions
        (id, workspace_id, parent_id, document_json, manifest_json, document_digest, validation_json, operations_json, created_by)
      values (${revisionId}, ${workspaceId}, ${rows[0].current_revision_id}, ${transaction.json(JSON.parse(JSON.stringify(content.document)))},
        ${transaction.json(manifest)}, ${content.digest}, ${transaction.json(JSON.parse(JSON.stringify(content.diagnostics)))},
        ${transaction.json({ type: 'test-title', title, diff })}, ${actor.accountId})`;
    await transaction`update draft_workspaces set current_revision_id = ${revisionId},
      working_document_json = ${transaction.json(JSON.parse(JSON.stringify(content.document)))}, working_manifest_json = ${transaction.json(manifest)},
      working_document_digest = ${content.digest}, working_validation_json = ${transaction.json(JSON.parse(JSON.stringify(content.diagnostics)))},
      working_operations_json = '[]'::jsonb, preview_acknowledged_revision_id = null, updated_at = now() where id = ${workspaceId}::uuid`;
    return { revisionId, diff };
  });
}

export function documentDigest(document: unknown): string {
  return createHash('sha256').update(JSON.stringify(document)).digest('hex');
}

export async function rebaseWorkspace(workspaceId: string, actor: Principal & { accountId: string }, blobToken: string): Promise<{ revisionId: string; baseEtag: string }> {
  const sql = requiredDatabase();
  const workspaces = await sql<{ story_id: string; current_revision_id: string; status: string; production_release_id: string; production_etag: string; manifest_json: { path: string; size: number; sha256: string; contentType: string }[] }[]>`
    select dw.story_id, dw.current_revision_id, dw.status, s.production_release_id, s.production_etag, pr.manifest_json
    from draft_workspaces dw join stories s on s.id = dw.story_id join production_releases pr on pr.id = s.production_release_id
    where dw.id = ${workspaceId}::uuid`;
  const workspace = workspaces[0];
  if (!workspace || !['active', 'conflict'].includes(workspace.status)) throw new Error('This workspace cannot be rebased.');
  const history = await sql<{ operations: { type: string; [key: string]: unknown } | null }[]>`
    with recursive ancestry as (
      select id, parent_id, operations_json, 0 as depth from draft_revisions where id = ${workspace.current_revision_id}::uuid
      union all
      select parent.id, parent.parent_id, parent.operations_json, ancestry.depth + 1
      from draft_revisions parent join ancestry on ancestry.parent_id = parent.id
    ) select operations_json as operations from ancestry order by depth desc`;
  const stored = await get(`${workspace.story_id}/story.json`, { access: 'public', token: blobToken, useCache: false });
  if (!stored || stored.statusCode !== 200) throw new Error('The latest production story is unavailable.');
  const content = replayRebaseOperations(await new Response(stored.stream).text(), history.map(item => item.operations));
  const manifest = workspace.manifest_json.map(file => file.path === 'story.json'
    ? { ...file, size: content.bytes.byteLength, sha256: content.digest }
    : file);
  const revisionId = randomUUID();
  await sql.begin(async transaction => {
    const locked = await transaction<{ current_revision_id: string }[]>`select current_revision_id from draft_workspaces where id = ${workspaceId}::uuid for update`;
    if (locked[0]?.current_revision_id !== workspace.current_revision_id) throw new Error('The workspace changed while rebasing.');
    await transaction`
      insert into draft_revisions (id, workspace_id, parent_id, document_json, manifest_json, document_digest, validation_json, operations_json, created_by)
      values (${revisionId}, ${workspaceId}, ${workspace.current_revision_id}, ${transaction.json(JSON.parse(JSON.stringify(content.document)))},
        ${transaction.json(manifest)}, ${content.digest}, ${transaction.json(JSON.parse(JSON.stringify(content.diagnostics)))},
        ${transaction.json({ type: 'test-title', title: content.document.title, rebased: true, replayed: history.length - 1 })}, ${actor.accountId})`;
    await transaction`
      update draft_workspaces set base_release_id = ${workspace.production_release_id}, base_etag = ${workspace.production_etag},
        current_revision_id = ${revisionId}, working_document_json = ${transaction.json(JSON.parse(JSON.stringify(content.document)))},
        working_manifest_json = ${transaction.json(manifest)}, working_document_digest = ${content.digest},
        working_validation_json = ${transaction.json(JSON.parse(JSON.stringify(content.diagnostics)))}, working_operations_json = '[]'::jsonb,
        preview_acknowledged_revision_id = null, status = 'active', updated_at = now()
      where id = ${workspaceId}::uuid`;
  });
  return { revisionId, baseEtag: workspace.production_etag };
}

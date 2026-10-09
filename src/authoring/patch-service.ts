import { randomUUID } from 'node:crypto';
import { database } from '../persistence/postgres.js';
import type { Principal } from '../auth/model.js';
import { applyAuthoringOperations, PatchError, type AuthoringOperation } from './patch.js';
import { validatedRevision } from './revisions.js';

interface ManifestFile { path: string; size: number; sha256: string; contentType: string }
const ASSET_PATH = /^(?:assets|cards)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:svg|png|jpg|jpeg|webp|avif)$/;

export class PatchRevisionError extends Error {
  constructor(public code: string, message: string, public diagnostics?: unknown) { super(message); }
}

function requiredDatabase() {
  const sql = database();
  if (!sql) throw new PatchRevisionError('persistence_unavailable', 'Authoring persistence is unavailable.');
  return sql;
}

function referencedAssets(document: unknown): Set<string> {
  const references = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      if (key === 'src' && typeof child === 'string' && ASSET_PATH.test(child)) references.add(child);
      else visit(child);
    }
  };
  visit(document); return references;
}

export async function applyPatchToWorkingDraft(input: {
  generationId: string; baseRevisionId: string; operations: AuthoringOperation[]; explanation: string;
}): Promise<{ workingDraftUpdated: true; diff: unknown }> {
  if (!input.explanation.trim() || input.explanation.length > 2_000) throw new PatchRevisionError('invalid_explanation', 'A concise proposal explanation is required.');
  const sql = requiredDatabase();
  return sql.begin(async transaction => {
    const rows = await transaction<{
      workspace_id: string; organization_id: string; account_id: string; generation_status: string;
      current_revision_id: string; workspace_status: string; document_json: unknown; manifest_json: ManifestFile[]; working_operations_json: unknown[];
    }[]>`
      select g.workspace_id, s.organization_id, g.account_id, g.status as generation_status,
        dw.current_revision_id, dw.status as workspace_status,
        dw.working_document_json as document_json, dw.working_manifest_json as manifest_json, dw.working_operations_json
      from generations g join draft_workspaces dw on dw.id = g.workspace_id join stories s on s.id = dw.story_id
      where g.id = ${input.generationId}::uuid for update of g, dw`;
    const target = rows[0];
    if (!target) throw new PatchRevisionError('unresolved_base', 'The generation base revision was not found.');
    if (target.generation_status !== 'running') throw new PatchRevisionError('generation_inactive', 'Only a running generation can propose a patch.');
    if (target.working_operations_json.some(item => (item as { generationId?: string }).generationId === input.generationId)) {
      throw new PatchRevisionError('proposal_exists', 'This generation already updated the working draft.');
    }
    if (target.workspace_status !== 'active') throw new PatchRevisionError('workspace_inactive', 'Only an active workspace can accept a proposal.');
    if (target.current_revision_id !== input.baseRevisionId) throw new PatchRevisionError('stale_base', 'The workspace head changed before this proposal was applied.');

    let applied;
    try { applied = applyAuthoringOperations(target.document_json, input.operations); }
    catch (error) {
      if (error instanceof PatchError) throw new PatchRevisionError(error.code, error.message);
      throw error;
    }
    let content;
    try { content = validatedRevision(applied.document); }
    catch (error) { throw new PatchRevisionError('invalid_story', error instanceof Error ? error.message : 'The proposed story is invalid.'); }

    const references = referencedAssets(content.document);
    const manifest = target.manifest_json.filter(file => file.path === 'story.json' || references.has(file.path));
    const available = await transaction<{
      id: string; logical_path: string; digest: string; media_type: string; bytes: number;
    }[]>`
      select id, logical_path, digest, media_type, bytes::int from assets
      where workspace_id = ${target.workspace_id}::uuid and scan_status = 'approved' and retired_at is null`;
    for (const path of references) {
      if (manifest.some(file => file.path === path)) continue;
      const asset = available.find(item => item.logical_path === path);
      if (!asset) throw new PatchRevisionError('missing_asset', `Referenced asset ${path} is not approved for this workspace.`);
      manifest.push({ path, size: asset.bytes, sha256: asset.digest, contentType: asset.media_type });
    }
    const storyIndex = manifest.findIndex(file => file.path === 'story.json');
    const storyFile = { path: 'story.json', size: content.bytes.byteLength, sha256: content.digest, contentType: 'application/json' };
    if (storyIndex >= 0) manifest[storyIndex] = storyFile; else manifest.push(storyFile);
    manifest.sort((left, right) => left.path.localeCompare(right.path));

    const operation = { type: 'ai-patch', generationId: input.generationId, baseRevisionId: input.baseRevisionId,
      operations: input.operations, explanation: input.explanation, diff: applied.diff };
    await transaction`
      update draft_workspaces set working_document_json = ${transaction.json(JSON.parse(JSON.stringify(content.document)))},
        working_manifest_json = ${transaction.json(JSON.parse(JSON.stringify(manifest)))}, working_document_digest = ${content.digest},
        working_validation_json = ${transaction.json(JSON.parse(JSON.stringify(content.diagnostics)))},
        working_operations_json = working_operations_json || ${transaction.json(JSON.parse(JSON.stringify([operation])))},
        preview_acknowledged_revision_id = null, updated_at = now()
      where id = ${target.workspace_id}`;
    await transaction`
      insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
      values (${randomUUID()}, ${target.organization_id}, ${target.account_id}, 'working-draft.ai-update', 'workspace', ${target.workspace_id},
        ${transaction.json({ workspaceId: target.workspace_id, generationId: input.generationId, baseRevisionId: input.baseRevisionId, operationCount: input.operations.length })})`;
    return { workingDraftUpdated: true, diff: applied.diff };
  });
}

export async function acceptWorkingDraft(workspaceId: string, actor: Principal & { accountId: string }): Promise<string> {
  const sql = requiredDatabase();
  return sql.begin(async transaction => {
    const rows = await transaction<{
      story_id: string; organization_id: string; current_revision_id: string; status: string; document_json: unknown;
      manifest_json: ManifestFile[]; document_digest: string; validation_json: unknown; operations_json: unknown[];
    }[]>`
      select dw.story_id, s.organization_id, dw.current_revision_id, dw.status,
        dw.working_document_json as document_json, dw.working_manifest_json as manifest_json,
        dw.working_document_digest as document_digest, dw.working_validation_json as validation_json,
        dw.working_operations_json as operations_json
      from draft_workspaces dw join stories s on s.id = dw.story_id
      where dw.id = ${workspaceId}::uuid for update of dw`;
    const draft = rows[0];
    if (!draft || draft.status !== 'active') throw new PatchRevisionError('workspace_inactive', 'Only an active workspace can accept changes.');
    if (!draft.operations_json.length) throw new PatchRevisionError('no_pending_changes', 'There are no pending assistant changes to accept.');
    const revisionId = randomUUID();
    await transaction`
      insert into draft_revisions
        (id, workspace_id, parent_id, document_json, manifest_json, document_digest, validation_json, operations_json, created_by)
      values (${revisionId}, ${workspaceId}, ${draft.current_revision_id}, ${transaction.json(draft.document_json as never)},
        ${transaction.json(draft.manifest_json as never)}, ${draft.document_digest}, ${transaction.json(draft.validation_json as never)},
        ${transaction.json(JSON.parse(JSON.stringify({ type: 'working-draft-accept', changes: draft.operations_json })))}, ${actor.accountId})`;
    await transaction`
      insert into revision_assets (revision_id, asset_id, logical_path)
      select ${revisionId}, a.id, a.logical_path from assets a
      where a.workspace_id = ${workspaceId}::uuid and a.scan_status = 'approved' and a.retired_at is null
        and ${transaction.json(draft.manifest_json as never)}::jsonb @> jsonb_build_array(jsonb_build_object('path', a.logical_path))
      on conflict do nothing`;
    await transaction`
      update draft_workspaces set current_revision_id = ${revisionId}, working_operations_json = '[]'::jsonb,
        preview_acknowledged_revision_id = null, updated_at = now() where id = ${workspaceId}::uuid`;
    await transaction`
      insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
      values (${randomUUID()}, ${draft.organization_id}, ${actor.accountId}, 'working-draft.accept', 'revision', ${revisionId},
        ${transaction.json({ workspaceId, parentRevisionId: draft.current_revision_id, changeCount: draft.operations_json.length })})`;
    return revisionId;
  });
}

export async function discardWorkingDraft(workspaceId: string, actor: Principal & { accountId: string }): Promise<void> {
  const sql = requiredDatabase();
  await sql.begin(async transaction => {
    const rows = await transaction<{ organization_id: string; current_revision_id: string; status: string }[]>`
      select s.organization_id, dw.current_revision_id, dw.status from draft_workspaces dw
      join stories s on s.id = dw.story_id where dw.id = ${workspaceId}::uuid for update of dw`;
    const draft = rows[0];
    if (!draft || draft.status !== 'active') throw new PatchRevisionError('workspace_inactive', 'Only an active workspace can discard changes.');
    await transaction`
      update draft_workspaces dw set working_document_json = dr.document_json, working_manifest_json = dr.manifest_json,
        working_document_digest = dr.document_digest, working_validation_json = dr.validation_json,
        working_operations_json = '[]'::jsonb, preview_acknowledged_revision_id = null, updated_at = now()
      from draft_revisions dr where dw.id = ${workspaceId}::uuid and dr.id = dw.current_revision_id`;
    await transaction`
      insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
      values (${randomUUID()}, ${draft.organization_id}, ${actor.accountId}, 'working-draft.discard', 'workspace', ${workspaceId},
        ${transaction.json({ revisionId: draft.current_revision_id })})`;
  });
}

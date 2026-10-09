import { randomUUID } from 'node:crypto';
import { del, get, put } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import type { Principal } from '../auth/model.js';
import { database } from '../persistence/postgres.js';
import OpenAI from 'openai';
import {
  AssetInspectionError, inspectDraftAsset, MAX_DRAFT_ASSET_BYTES, parseDraftAssetType, prepareAssetIdentity,
  type DraftAssetType,
} from './assets.js';

const GRANT_LIFETIME_MS = 10 * 60 * 1000;
const MAX_ACTIVE_ASSETS = 128;

export class DraftAssetError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface DraftAssetRecord {
  id: string;
  logicalPath: string;
  mediaType: string;
  bytes: number;
  width: number;
  height: number;
  digest: string;
  scanStatus: 'approved' | 'rejected';
  createdAt: string;
}

function requiredDatabase() {
  const sql = database();
  if (!sql) throw new DraftAssetError('persistence_unavailable', 'Authoring persistence is unavailable.');
  return sql;
}

export function draftBlobToken(): string {
  const token = process.env.DRAFT_BLOB_READ_WRITE_TOKEN;
  if (!token) throw new DraftAssetError('storage_unavailable', 'Private draft storage is unavailable.');
  return token;
}

export async function prepareDraftUpload(
  workspaceId: string,
  actor: Principal & { accountId: string },
  input: { mediaType: unknown; area?: unknown },
): Promise<{ grantId: string; logicalPath: string; pathname: string; clientToken: string; expiresAt: string; maximumBytes: number }> {
  const mediaType = parseDraftAssetType(input.mediaType);
  const area = input.area === undefined ? 'assets' : input.area;
  if (area !== 'assets' && area !== 'cards') throw new DraftAssetError('invalid_asset', 'The asset area must be assets or cards.');
  const identity = prepareAssetIdentity(workspaceId, mediaType, area);
  const expiresAt = new Date(Date.now() + GRANT_LIFETIME_MS);
  const sql = requiredDatabase();
  await sql.begin(async transaction => {
    const rows = await transaction<{ organization_id: string; status: string; count: number }[]>`
      select s.organization_id, dw.status,
        (select count(*)::int from assets a where a.workspace_id = dw.id and a.retired_at is null) as count
      from draft_workspaces dw join stories s on s.id = dw.story_id
      where dw.id = ${workspaceId}::uuid for update of dw`;
    if (!rows[0] || rows[0].status !== 'active') throw new DraftAssetError('workspace_inactive', 'Uploads require an active workspace.');
    if (rows[0].count >= MAX_ACTIVE_ASSETS) throw new DraftAssetError('asset_quota', 'This workspace has reached its asset limit.');
    await transaction`
      insert into upload_grants
        (id, workspace_id, uploader_id, logical_path, storage_key, expected_media_type, maximum_bytes, status, expires_at)
      values (${identity.id}, ${workspaceId}, ${actor.accountId}, ${identity.logicalPath}, ${identity.quarantineKey},
        ${mediaType}, ${MAX_DRAFT_ASSET_BYTES}, 'prepared', ${expiresAt})`;
  });
  const clientToken = await generateClientTokenFromReadWriteToken({
    token: draftBlobToken(), pathname: identity.quarantineKey, maximumSizeInBytes: MAX_DRAFT_ASSET_BYTES,
    allowedContentTypes: [mediaType], validUntil: expiresAt.getTime(), addRandomSuffix: false,
    allowOverwrite: false, cacheControlMaxAge: 60,
  });
  return {
    grantId: identity.id, logicalPath: identity.logicalPath, pathname: identity.quarantineKey,
    clientToken, expiresAt: expiresAt.toISOString(), maximumBytes: MAX_DRAFT_ASSET_BYTES,
  };
}

export async function completeDraftUpload(
  workspaceId: string,
  grantId: string,
  actor: Principal & { accountId: string },
): Promise<DraftAssetRecord> {
  const sql = requiredDatabase();
  const grants = await sql<{
    logical_path: string; storage_key: string; expected_media_type: DraftAssetType; maximum_bytes: number;
    status: string; expires_at: string; uploader_id: string; organization_id: string;
  }[]>`
    update upload_grants ug set status = 'inspecting'
    from draft_workspaces dw join stories s on s.id = dw.story_id
    where ug.id = ${grantId}::uuid and ug.workspace_id = ${workspaceId}::uuid and ug.workspace_id = dw.id
      and ug.uploader_id = ${actor.accountId}::uuid and ug.status = 'prepared' and ug.expires_at > now() and dw.status = 'active'
    returning ug.logical_path, ug.storage_key, ug.expected_media_type, ug.maximum_bytes, ug.status, ug.expires_at,
      ug.uploader_id, s.organization_id`;
  const grant = grants[0];
  if (!grant) throw new DraftAssetError('upload_expired', 'The upload grant is missing, expired, already used, or not owned by this account.');

  let approvedKey: string | undefined;
  try {
    const object = await get(grant.storage_key, { access: 'private', token: draftBlobToken(), useCache: false });
    if (!object || object.statusCode !== 200) throw new DraftAssetError('upload_incomplete', 'The quarantined upload is missing.');
    const source = new Uint8Array(await new Response(object.stream).arrayBuffer());
    if (source.byteLength > grant.maximum_bytes || object.blob.contentType !== grant.expected_media_type) {
      throw new DraftAssetError('invalid_asset', 'The upload does not match its grant.');
    }
    const inspected = await inspectDraftAsset(source, grant.expected_media_type);
    const assetId = randomUUID();
    approvedKey = `_drafts/${workspaceId}/approved/${assetId}/${grant.logical_path}`;
    await put(approvedKey, Buffer.from(inspected.bytes), {
      access: 'private', token: draftBlobToken(), addRandomSuffix: false, allowOverwrite: false,
      contentType: inspected.mediaType, cacheControlMaxAge: 60,
    });
    const rows = await sql<DraftAssetRecord[]>`
      with inserted as (
        insert into assets
          (id, organization_id, workspace_id, upload_grant_id, digest, media_type, bytes, width, height,
           logical_path, storage_key, scan_status, provenance, uploader_id)
        values (${assetId}, ${grant.organization_id}, ${workspaceId}, ${grantId}, ${inspected.digest}, ${inspected.mediaType},
          ${inspected.bytes.byteLength}, ${inspected.width}, ${inspected.height}, ${grant.logical_path}, ${approvedKey}, 'approved',
          ${sql.json({ kind: 'user-upload', normalized: inspected.mediaType !== 'image/svg+xml', sourceMediaType: grant.expected_media_type })},
          ${actor.accountId})
        returning id, logical_path, media_type, bytes, width, height, digest, scan_status, created_at
      ), completed as (
        update upload_grants set status = 'completed', completed_at = now() where id = ${grantId}
      )
      select id, logical_path as "logicalPath", media_type as "mediaType", bytes::int, width, height, digest,
        scan_status as "scanStatus", created_at as "createdAt" from inserted`;
    await del(grant.storage_key, { token: draftBlobToken() });
    await sql`
      insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
      values (${randomUUID()}, ${grant.organization_id}, ${actor.accountId}, 'asset.upload', 'asset', ${assetId},
        ${sql.json({ workspaceId, logicalPath: grant.logical_path, digest: inspected.digest })})`;
    return rows[0];
  } catch (error) {
    if (approvedKey) await del(approvedKey, { token: draftBlobToken() }).catch(() => undefined);
    await del(grant.storage_key, { token: draftBlobToken() }).catch(() => undefined);
    await sql`update upload_grants set status = 'rejected', completed_at = now() where id = ${grantId}`;
    if (error instanceof DraftAssetError) throw error;
    if (error instanceof AssetInspectionError) throw new DraftAssetError(error.code, error.message);
    throw error;
  }
}

export async function listDraftAssets(workspaceId: string): Promise<DraftAssetRecord[]> {
  return requiredDatabase()<DraftAssetRecord[]>`
    select id, logical_path as "logicalPath", media_type as "mediaType", bytes::int, width, height, digest,
      scan_status as "scanStatus", created_at as "createdAt"
    from assets where workspace_id = ${workspaceId}::uuid and scan_status = 'approved' and retired_at is null
    order by created_at desc, id desc`;
}

export async function generateDraftImage(
  generationId: string,
  input: { prompt: string; aspect: 'square' | 'landscape' | 'portrait' },
): Promise<DraftAssetRecord & { revisedPrompt?: string }> {
  const prompt = input.prompt.trim();
  if (!prompt || prompt.length > 4_000) throw new DraftAssetError('invalid_image_prompt', 'An image prompt of 1–4,000 characters is required.');
  // Resolve storage before invoking the paid image provider. A generated image
  // is useful only if it can be persisted as an approved workspace asset.
  const blobToken = draftBlobToken();
  const sql = requiredDatabase();
  const rows = await sql<{ workspace_id: string; organization_id: string; account_id: string; status: string; count: number }[]>`
    select g.workspace_id, s.organization_id, g.account_id, dw.status,
      (select count(*)::int from assets a where a.workspace_id = dw.id and a.retired_at is null) as count
    from generations g join draft_workspaces dw on dw.id = g.workspace_id join stories s on s.id = dw.story_id
    where g.id = ${generationId}::uuid and g.status = 'running'`;
  const target = rows[0];
  if (!target || target.status !== 'active') throw new DraftAssetError('workspace_inactive', 'Image generation requires an active generation and workspace.');
  if (target.count >= MAX_ACTIVE_ASSETS) throw new DraftAssetError('asset_quota', 'This workspace has reached its asset limit.');
  const model = process.env.SCROLLTASTIC_IMAGE_MODEL ?? 'gpt-image-2.5-flare';
  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(model)) throw new DraftAssetError('configuration_error', 'The image model is invalid.');
  const size = input.aspect === 'landscape' ? '1536x1024' : input.aspect === 'portrait' ? '1024x1536' : '1024x1024';
  const result = await new OpenAI().images.generate({ model, prompt, size, quality: 'low', output_format: 'png', n: 1 });
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) throw new DraftAssetError('image_generation_failed', 'The image provider returned no image.');
  const inspected = await inspectDraftAsset(Buffer.from(encoded, 'base64'), 'image/png');
  const assetId = randomUUID();
  const logicalPath = `assets/generated-${assetId}.png`;
  const storageKey = `_drafts/${target.workspace_id}/approved/${assetId}/${logicalPath}`;
  await put(storageKey, Buffer.from(inspected.bytes), {
    access: 'private', token: blobToken, addRandomSuffix: false, allowOverwrite: false,
    contentType: inspected.mediaType, cacheControlMaxAge: 60,
  });
  try {
    const inserted = await sql<DraftAssetRecord[]>`
      insert into assets
        (id, organization_id, workspace_id, upload_grant_id, digest, media_type, bytes, width, height,
         logical_path, storage_key, scan_status, provenance, uploader_id)
      values (${assetId}, ${target.organization_id}, ${target.workspace_id}, null, ${inspected.digest}, ${inspected.mediaType},
        ${inspected.bytes.byteLength}, ${inspected.width}, ${inspected.height}, ${logicalPath}, ${storageKey}, 'approved',
        ${sql.json({ kind: 'ai-generated', generationId, model, prompt })}, ${target.account_id})
      returning id, logical_path as "logicalPath", media_type as "mediaType", bytes::int, width, height, digest,
        scan_status as "scanStatus", created_at as "createdAt"`;
    await sql`
      insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
      values (${randomUUID()}, ${target.organization_id}, ${target.account_id}, 'asset.ai-generate', 'asset', ${assetId},
        ${sql.json({ workspaceId: target.workspace_id, generationId, logicalPath, model, aspect: input.aspect })})`;
    return { ...inserted[0], ...(result.data?.[0]?.revised_prompt ? { revisedPrompt: result.data[0].revised_prompt } : {}) };
  } catch (error) {
    await del(storageKey, { token: blobToken }).catch(() => undefined);
    throw error;
  }
}

export async function draftAssetContent(workspaceId: string, assetId: string): Promise<{ storageKey: string; mediaType: string; digest: string } | undefined> {
  const rows = await requiredDatabase()<{ storageKey: string; mediaType: string; digest: string }[]>`
    select storage_key as "storageKey", media_type as "mediaType", digest
    from assets where id = ${assetId}::uuid and workspace_id = ${workspaceId}::uuid
      and scan_status = 'approved' and retired_at is null`;
  return rows[0];
}

export async function expireDraftUploads(now = new Date()): Promise<string[]> {
  const rows = await requiredDatabase()<{ id: string; storage_key: string }[]>`
    update upload_grants set status = 'expired', completed_at = ${now}
    where status = 'prepared' and expires_at <= ${now} returning id, storage_key`;
  for (const row of rows) await del(row.storage_key, { token: draftBlobToken() }).catch(() => undefined);
  return rows.map(row => row.id);
}

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Principal } from '../auth/model.js';
import { database } from '../persistence/postgres.js';

export const SHARE_COOKIE = 'scrolltastic_share';
export const DEFAULT_SHARE_LIFETIME_MS = 30 * 60 * 1000;
export const MAX_SHARE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const SHARE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export class ShareGrantError extends Error {
  constructor(public code: 'invalid_share' | 'not_found' | 'expired' | 'persistence_unavailable', message: string) { super(message); }
}

export interface ShareGrant {
  id: string;
  storyId: string;
  workspaceId: string;
  revisionId: string;
  baseReleaseId: string;
  expiresAt: string;
}

function requiredDatabase() {
  const sql = database();
  if (!sql) throw new ShareGrantError('persistence_unavailable', 'Private sharing is unavailable.');
  return sql;
}

export function newShareToken(): string {
  return randomBytes(32).toString('base64url');
}

export function shareTokenDigest(token: string): string {
  if (!SHARE_TOKEN.test(token)) throw new ShareGrantError('invalid_share', 'This share link is invalid.');
  return createHash('sha256').update(token).digest('hex');
}

export function readShareCookie(request: Request): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SHARE_COOKIE) return value.join('=');
  }
  return undefined;
}

export function shareCookie(token: string, expiresAt: Date): string {
  shareTokenDigest(token);
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return `${SHARE_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearShareCookie(): string {
  return `${SHARE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function createRevisionShare(
  workspaceId: string,
  revisionId: string,
  actor: Principal & { accountId: string },
  lifetimeMs = DEFAULT_SHARE_LIFETIME_MS,
): Promise<ShareGrant & { token: string }> {
  if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 60_000 || lifetimeMs > MAX_SHARE_LIFETIME_MS) {
    throw new ShareGrantError('invalid_share', 'Share lifetime must be between one minute and 24 hours.');
  }
  const sql = requiredDatabase();
  const targets = await sql<{ story_id: string; base_release_id: string; current_revision_id: string; has_pending_changes: boolean }[]>`
    select dw.story_id, dw.base_release_id, dw.current_revision_id,
      jsonb_array_length(dw.working_operations_json) > 0 as has_pending_changes
    from draft_revisions dr
    join draft_workspaces dw on dw.id = dr.workspace_id
    where dr.id = ${revisionId}::uuid and dr.workspace_id = ${workspaceId}::uuid`;
  if (!targets[0]) throw new ShareGrantError('not_found', 'Revision not found.');
  if (targets[0].current_revision_id === revisionId && targets[0].has_pending_changes) {
    throw new ShareGrantError('invalid_share', 'Accept or discard pending changes before sharing this revision.');
  }
  const id = randomUUID();
  const token = newShareToken();
  const expiresAt = new Date(Date.now() + lifetimeMs);
  await sql.begin(async transaction => {
    await transaction`
      insert into revision_share_grants
        (id, story_id, workspace_id, revision_id, base_release_id, created_by, token_digest, expires_at)
      values (${id}, ${targets[0].story_id}, ${workspaceId}, ${revisionId}, ${targets[0].base_release_id}, ${actor.accountId},
        ${shareTokenDigest(token)}, ${expiresAt})`;
    await transaction`
      insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
      select ${randomUUID()}, s.organization_id, ${actor.accountId}, 'revision.share.create', 'share', ${id},
        ${transaction.json({ storyId: targets[0].story_id, workspaceId, revisionId, expiresAt: expiresAt.toISOString() })}
      from stories s where s.id = ${targets[0].story_id}::uuid`;
  });
  return { id, token, storyId: targets[0].story_id, workspaceId, revisionId,
    baseReleaseId: targets[0].base_release_id, expiresAt: expiresAt.toISOString() };
}

export async function redeemRevisionShare(token: string): Promise<ShareGrant> {
  const sql = requiredDatabase();
  const rows = await sql<ShareGrant[]>`
    update revision_share_grants set redeemed_at = coalesce(redeemed_at, now()), last_accessed_at = now()
    where token_digest = ${shareTokenDigest(token)} and status = 'active' and expires_at > now()
    returning id, story_id as "storyId", workspace_id as "workspaceId", revision_id as "revisionId",
      base_release_id as "baseReleaseId", expires_at as "expiresAt"`;
  if (!rows[0]) throw new ShareGrantError('expired', 'This share link is invalid, expired, or revoked.');
  return rows[0];
}

export async function authorizeSharedPackage(
  token: string | undefined,
  storyId: string,
  grantId: string,
): Promise<ShareGrant> {
  if (!token) throw new ShareGrantError('expired', 'This shared story session is unavailable.');
  const rows = await requiredDatabase()<ShareGrant[]>`
    update revision_share_grants set last_accessed_at = now()
    where id = ${grantId}::uuid and story_id = ${storyId}::uuid
      and token_digest = ${shareTokenDigest(token)} and status = 'active' and expires_at > now()
    returning id, story_id as "storyId", workspace_id as "workspaceId", revision_id as "revisionId",
      base_release_id as "baseReleaseId", expires_at as "expiresAt"`;
  if (!rows[0]) throw new ShareGrantError('expired', 'This shared story session is unavailable.');
  return rows[0];
}

export async function shareGrantStoryId(grantId: string): Promise<string | undefined> {
  const rows = await requiredDatabase()<{ storyId: string }[]>`
    select story_id as "storyId" from revision_share_grants where id = ${grantId}::uuid`;
  return rows[0]?.storyId;
}

export async function revokeRevisionShare(grantId: string, actor: Principal & { accountId: string }): Promise<boolean> {
  const sql = requiredDatabase();
  return sql.begin(async transaction => {
    const rows = await transaction<{ story_id: string }[]>`
      update revision_share_grants set status = 'revoked', revoked_at = now()
      where id = ${grantId}::uuid and status = 'active' returning story_id`;
    if (!rows[0]) return false;
    await transaction`
      insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
      select ${randomUUID()}, s.organization_id, ${actor.accountId}, 'revision.share.revoke', 'share', ${grantId},
        ${transaction.json({ storyId: rows[0].story_id })}
      from stories s where s.id = ${rows[0].story_id}::uuid`;
    return true;
  });
}

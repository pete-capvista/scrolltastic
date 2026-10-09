import postgres, { type Sql } from 'postgres';
import { randomUUID } from 'node:crypto';
import type { Principal, StoryRole } from '../auth/model.js';
import type { StoryMembershipRepository } from '../auth/policy.js';

let client: Sql | undefined;

export function database(): Sql | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  client ??= postgres(url, { max: 4, idle_timeout: 20, connect_timeout: 10 });
  return client;
}

export class PostgresStoryMembershipRepository implements StoryMembershipRepository {
  constructor(private readonly sql: Sql) {}

  async findRole(storyId: string, principal: Principal): Promise<StoryRole | undefined> {
    const rows = principal.accountId
      ? await this.sql<{ role: StoryRole }[]>`
          select sm.role
          from story_memberships sm
          join accounts a on a.id = sm.account_id
          where sm.story_id = ${storyId}::uuid and a.id = ${principal.accountId}::uuid
            and a.status = 'active'
          limit 1`
      : await this.sql<{ role: StoryRole }[]>`
          select sm.role
          from story_memberships sm
          join accounts a on a.id = sm.account_id
          where sm.story_id = ${storyId}::uuid and a.identity_provider = ${principal.provider}
            and a.provider_subject = ${principal.subject} and a.status = 'active'
          limit 1`;
    return rows[0]?.role;
  }
}

export class EmptyStoryMembershipRepository implements StoryMembershipRepository {
  async findRole(): Promise<undefined> { return undefined; }
}

export function storyMembershipRepository(): StoryMembershipRepository {
  const sql = database();
  return sql ? new PostgresStoryMembershipRepository(sql) : new EmptyStoryMembershipRepository();
}

export async function storyOrganizationId(storyId: string): Promise<string | undefined> {
  const sql = database();
  if (!sql) return undefined;
  const rows = await sql<{ organizationId: string }[]>`
    select organization_id as "organizationId" from stories where id = ${storyId}::uuid and status = 'active'`;
  return rows[0]?.organizationId;
}

export async function upsertAccount(principal: Principal): Promise<Principal & { accountId: string }> {
  const sql = database();
  if (!sql) throw new Error('Account persistence is unavailable.');
  const rows = await sql<{ id: string }[]>`
    insert into accounts (id, identity_provider, provider_subject, display_name, status)
    values (gen_random_uuid(), ${principal.provider}, ${principal.subject}, ${principal.displayName ?? null}, 'active')
    on conflict (identity_provider, provider_subject) do update
      set display_name = excluded.display_name
    returning id`;
  return { ...principal, accountId: rows[0].id };
}

export interface PublishedReleaseRecord {
  storyId: string;
  releaseId: string;
  etag: string;
  manifest: readonly { path: string; size: number; sha256: string; contentType: string }[];
  documentDigest: string;
  storagePrefix: string;
  actor: Principal;
}

export async function recordPublishedRelease(record: PublishedReleaseRecord): Promise<boolean> {
  const sql = database();
  if (!sql) return false;
  await sql.begin(async transaction => {
    const accounts = record.actor.accountId
      ? await transaction<{ id: string }[]>`select id from accounts where id = ${record.actor.accountId}::uuid and status = 'active'`
      : await transaction<{ id: string }[]>`
          select id from accounts
          where identity_provider = ${record.actor.provider} and provider_subject = ${record.actor.subject} and status = 'active'`;
    if (!accounts[0]) throw new Error('The publishing account is not present in production inventory.');
    const stories = await transaction<{ organization_id: string; production_release_id?: string }[]>`
      select organization_id, production_release_id from stories where id = ${record.storyId}::uuid for update`;
    if (!stories[0]) throw new Error('The published story is not present in production inventory.');
    await transaction`
      insert into production_releases
        (id, story_id, parent_id, etag, manifest_json, document_digest, storage_prefix, actor_id)
      values
        (${record.releaseId}, ${record.storyId}, ${stories[0].production_release_id ?? null}, ${record.etag},
         ${transaction.json(record.manifest)}, ${record.documentDigest}, ${record.storagePrefix}, ${accounts[0].id})
      on conflict (story_id, etag) do nothing`;
    const releases = await transaction<{ id: string }[]>`
      select id from production_releases where story_id = ${record.storyId}::uuid and etag = ${record.etag}`;
    await transaction`
      update stories set production_release_id = ${releases[0].id}, production_etag = ${record.etag}, updated_at = now()
      where id = ${record.storyId}::uuid`;
    await transaction`
      insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
      values (${randomUUID()}, ${stories[0].organization_id}, ${accounts[0].id}, 'production.publish', 'release',
        ${releases[0].id}, ${transaction.json({ storyId: record.storyId, etag: record.etag })})`;
  });
  return true;
}

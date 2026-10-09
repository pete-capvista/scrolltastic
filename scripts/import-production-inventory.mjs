import { createHash, randomUUID } from 'node:crypto';
import { copy, get, head, list } from '@vercel/blob';
import postgres from 'postgres';
import { nip19 } from 'nostr-tools';

function values(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).filter(value => value.startsWith(prefix)).map(value => value.slice(prefix.length));
}

const databaseUrl = process.env.DATABASE_URL;
const token = process.env.BLOB_READ_WRITE_TOKEN;
const organizationId = values('organization-id')[0];
const organizationName = values('organization-name')[0];
const ownerGithub = values('owner-github')[0]?.toLowerCase();
const ownerNostr = values('owner-nostr')[0]?.toLowerCase();
const storyIds = values('story-id');
if (!databaseUrl || !token) throw new Error('DATABASE_URL and BLOB_READ_WRITE_TOKEN are required.');
if (!organizationId || !organizationName || Boolean(ownerGithub) === Boolean(ownerNostr) || storyIds.length < 1) {
  throw new Error('Usage: npm run db:import-production -- --organization-id=UUID --organization-name=NAME (--owner-nostr=HEX_PUBKEY | --owner-github=LOGIN) --story-id=UUID [--story-id=UUID]');
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
if (!uuid.test(organizationId) || storyIds.some(id => !uuid.test(id))) throw new Error('Organization and story IDs must be UUID v4 values.');
if (ownerNostr && !/^[0-9a-f]{64}$/.test(ownerNostr)) throw new Error('The Nostr owner must be a 64-character lowercase hexadecimal public key.');
const identityProvider = ownerNostr ? 'nostr' : 'github';
const providerSubject = ownerNostr ?? ownerGithub;
const displayName = ownerNostr ? nip19.npubEncode(ownerNostr) : ownerGithub;

const sql = postgres(databaseUrl, { max: 2 });
try {
  const accountId = randomUUID();
  await sql.begin(async transaction => {
    await transaction`
      insert into organizations (id, name, status)
      values (${organizationId}, ${organizationName}, 'active')
      on conflict (id) do update set name = excluded.name, status = 'active'`;
    await transaction`
      insert into accounts (id, identity_provider, provider_subject, display_name, status)
      values (${accountId}, ${identityProvider}, ${providerSubject}, ${displayName}, 'active')
      on conflict (identity_provider, provider_subject) do update set status = 'active'
      returning id`;
  });
  const [account] = await sql`select id from accounts where identity_provider = ${identityProvider} and provider_subject = ${providerSubject}`;
  await sql`
    insert into organization_memberships (organization_id, account_id, role)
    values (${organizationId}, ${account.id}, 'owner')
    on conflict (organization_id, account_id) do update set role = 'owner'`;

  for (const storyId of storyIds) {
    const storyHead = await head(`${storyId}/story.json`, { token });
    const existing = await sql`
      select pr.id from production_releases pr join stories s on s.id = pr.story_id
      where pr.story_id = ${storyId}::uuid and pr.etag = ${storyHead.etag} and s.organization_id = ${organizationId}::uuid`;
    if (existing[0]) {
      process.stdout.write(`Already imported ${storyId}\n`);
      continue;
    }
    const storyObject = await get(`${storyId}/story.json`, { access: 'public', token, useCache: false });
    if (!storyObject || storyObject.statusCode !== 200) throw new Error(`Could not read ${storyId}/story.json.`);
    const storyBytes = Buffer.from(await new Response(storyObject.stream).arrayBuffer());
    const document = JSON.parse(storyBytes.toString('utf8'));
    if (document.storyLanguage !== '5' || document.id !== storyId) throw new Error(`${storyId} is not a matching V5 package.`);
    const listed = await list({ prefix: `${storyId}/`, limit: 1000, token });
    if (listed.hasMore) throw new Error(`${storyId} has more than 1000 stable package objects; import it explicitly with a larger reviewed limit.`);
    const manifest = [];
    for (const blob of listed.blobs.sort((left, right) => left.pathname.localeCompare(right.pathname))) {
      const object = await get(blob.pathname, { access: 'public', token, useCache: false });
      if (!object || object.statusCode !== 200) throw new Error(`Could not read ${blob.pathname}.`);
      const bytes = Buffer.from(await new Response(object.stream).arrayBuffer());
      manifest.push({
        path: blob.pathname.slice(storyId.length + 1), bytes: bytes.length,
        contentType: blob.contentType, sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    const releaseId = randomUUID();
    const releasePrefix = `_releases/${storyId}/${releaseId}/`;
    for (const file of manifest) await copy(`${storyId}/${file.path}`, `${releasePrefix}${file.path}`, {
      access: 'public', token, addRandomSuffix: false, allowOverwrite: false,
      contentType: file.contentType, cacheControlMaxAge: 60,
    });
    await sql.begin(async transaction => {
      await transaction`
        insert into stories (id, organization_id, production_etag, status)
        values (${storyId}, ${organizationId}, ${storyHead.etag}, 'active')
        on conflict (id) do nothing`;
      const [story] = await transaction`select organization_id from stories where id = ${storyId}::uuid for update`;
      if (story.organization_id !== organizationId) throw new Error(`${storyId} already belongs to another organization.`);
      await transaction`
        insert into story_memberships (story_id, account_id, role)
        values (${storyId}, ${account.id}, 'owner')
        on conflict (story_id, account_id) do update set role = 'owner'`;
      await transaction`
        insert into production_releases
          (id, story_id, parent_id, etag, manifest_json, document_digest, storage_prefix, actor_id)
        values
          (${releaseId}, ${storyId}, null, ${storyHead.etag}, ${transaction.json(manifest)},
           ${createHash('sha256').update(storyBytes).digest('hex')}, ${releasePrefix}, ${account.id})
        on conflict (story_id, etag) do nothing`;
      const [release] = await transaction`select id from production_releases where story_id = ${storyId}::uuid and etag = ${storyHead.etag}`;
      await transaction`
        update stories set production_release_id = ${release.id}, production_etag = ${storyHead.etag}, updated_at = now()
        where id = ${storyId}::uuid`;
      await transaction`
        insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
        values (${randomUUID()}, ${organizationId}, ${account.id}, 'production.import', 'story', ${storyId},
          ${transaction.json({ releaseId: release.id, etag: storyHead.etag })})`;
    });
    process.stdout.write(`Imported ${storyId}\n`);
  }
} finally {
  await sql.end();
}

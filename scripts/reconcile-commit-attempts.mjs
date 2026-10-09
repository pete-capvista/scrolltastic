import { createHash, randomUUID } from 'node:crypto';
import { get, head } from '@vercel/blob';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!databaseUrl || !token) throw new Error('DATABASE_URL and BLOB_READ_WRITE_TOKEN are required.');
const sql = postgres(databaseUrl, { max: 1 });
try {
  const attempts = await sql`
    select ca.id, ca.workspace_id, ca.revision_id, ca.actor_id, ca.release_id,
      dw.story_id, s.organization_id, s.production_release_id as parent_id,
      dr.document_digest, dr.manifest_json
    from commit_attempts ca join draft_workspaces dw on dw.id = ca.workspace_id
    join stories s on s.id = dw.story_id join draft_revisions dr on dr.id = ca.revision_id
    where ca.status = 'reconciliation_required' order by ca.created_at`;
  for (const attempt of attempts) {
    const object = await get(`${attempt.story_id}/story.json`, { access: 'public', token, useCache: false });
    if (!object || object.statusCode !== 200) continue;
    const bytes = Buffer.from(await new Response(object.stream).arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== attempt.document_digest) {
      await sql`update commit_attempts set status = 'failed', error_code = 'production_digest_mismatch', completed_at = now() where id = ${attempt.id}`;
      continue;
    }
    const current = await head(`${attempt.story_id}/story.json`, { token });
    await sql.begin(async transaction => {
      await transaction`
        insert into production_releases (id, story_id, parent_id, etag, manifest_json, document_digest, storage_prefix, actor_id)
        values (${attempt.release_id}, ${attempt.story_id}, ${attempt.parent_id}, ${current.etag}, ${transaction.json(attempt.manifest_json)},
          ${attempt.document_digest}, ${`_releases/${attempt.story_id}/${attempt.release_id}/`}, ${attempt.actor_id})
        on conflict (story_id, etag) do nothing`;
      const [release] = await transaction`select id from production_releases where story_id = ${attempt.story_id} and etag = ${current.etag}`;
      await transaction`update stories set production_release_id = ${release.id}, production_etag = ${current.etag}, updated_at = now() where id = ${attempt.story_id}`;
      await transaction`update draft_workspaces set status = 'committed', updated_at = now() where id = ${attempt.workspace_id}`;
      await transaction`update commit_attempts set status = 'promoted', resulting_etag = ${current.etag}, error_code = null, completed_at = now() where id = ${attempt.id}`;
      await transaction`
        insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
        values (${randomUUID()}, ${attempt.organization_id}, ${attempt.actor_id}, 'workspace.commit.reconciled', 'release', ${release.id},
          ${transaction.json({ workspaceId: attempt.workspace_id, attemptId: attempt.id })})`;
    });
    process.stdout.write(`Reconciled ${attempt.id}\n`);
  }
} finally {
  await sql.end();
}

import { del } from '@vercel/blob';
import postgres from 'postgres';
import { claimMaintenanceLease, maintenanceEvent, recordMaintenanceFailure, releaseMaintenanceLease } from './maintenance-lease.mjs';

const databaseUrl = process.env.DATABASE_URL;
const token = process.env.DRAFT_BLOB_READ_WRITE_TOKEN;
const retentionDays = Number(process.env.DRAFT_ASSET_RETENTION_DAYS);
if (!databaseUrl || !token) throw new Error('DATABASE_URL and DRAFT_BLOB_READ_WRITE_TOKEN are required.');
if (!Number.isInteger(retentionDays) || retentionDays < 1) throw new Error('DRAFT_ASSET_RETENTION_DAYS must be a positive integer.');
const sql = postgres(databaseUrl, { max: 1 });
const jobName = 'cleanup-draft-assets';
let holder;
try {
  holder = await claimMaintenanceLease(sql, jobName);
  if (!holder) { maintenanceEvent({ event: jobName, outcome: 'skipped', reason: 'lease-held' }); process.exitCode = 0; }
  if (!holder) throw new Error('LEASE_HELD');
  const grants = await sql`
    update upload_grants set status = 'expired', completed_at = now()
    where id in (select id from upload_grants where status in ('prepared', 'inspecting') and expires_at <= now() order by expires_at limit 100)
    returning id, storage_key`;
  for (const grant of grants) try { await del(grant.storage_key, { token }); }
  catch (error) { await recordMaintenanceFailure(sql, jobName, 'upload-grant', grant.id, error); }

  const assets = await sql`
    select a.id, a.storage_key from assets a join draft_workspaces dw on dw.id = a.workspace_id
    where a.retired_at is null and dw.status in ('committed', 'closed')
      and a.created_at < now() - (${retentionDays}::text || ' days')::interval
      and not exists (select 1 from revision_assets ra where ra.asset_id = a.id)
    order by a.created_at limit 100`;
  for (const asset of assets) {
    try {
      await del(asset.storage_key, { token });
      await sql`update assets set retired_at = now() where id = ${asset.id} and retired_at is null`;
    } catch (error) { await recordMaintenanceFailure(sql, jobName, 'asset', asset.id, error); }
  }
  maintenanceEvent({ event: jobName, outcome: 'completed', grants: grants.length, assets: assets.length });
} catch (error) {
  if (!(error instanceof Error && error.message === 'LEASE_HELD')) throw error;
} finally {
  if (holder) await releaseMaintenanceLease(sql, jobName, holder);
  await sql.end();
}

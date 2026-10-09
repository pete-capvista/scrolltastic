import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { claimMaintenanceLease, maintenanceEvent, recordMaintenanceFailure, releaseMaintenanceLease } from './maintenance-lease.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const sql = postgres(databaseUrl, { max: 1 });
const jobName = 'reconcile-generations';
let holder;
try {
  holder = await claimMaintenanceLease(sql, jobName);
  if (!holder) { maintenanceEvent({ event: jobName, outcome: 'skipped', reason: 'lease-held' }); process.exitCode = 0; }
  if (!holder) throw new Error('LEASE_HELD');
  const stale = await sql`
    select g.id, g.status, g.account_id, s.organization_id, ur.reserved_units, ur.reserved_cost
    from generations g join draft_workspaces dw on dw.id = g.workspace_id join stories s on s.id = dw.story_id
    join usage_reservations ur on ur.generation_id = g.id
    where g.status in ('pending', 'running') and ur.status = 'active' and ur.expires_at <= now()
    order by g.created_at limit 100`;
  for (const generation of stale) try { await sql.begin(async transaction => {
    const [locked] = await transaction`
      select g.status, ur.status as reservation_status from generations g join usage_reservations ur on ur.generation_id = g.id
      where g.id = ${generation.id} for update of g, ur`;
    if (!locked || !['pending', 'running'].includes(locked.status) || locked.reservation_status !== 'active') return;
    if (locked.status === 'running') {
      const period = new Date().toISOString().slice(0, 10);
      await transaction`
        insert into usage_ledger (id, organization_id, account_id, generation_id, kind, units, cost, period_key)
        values (${randomUUID()}, ${generation.organization_id}, ${generation.account_id}, ${generation.id}, 'model_tokens',
          ${generation.reserved_units}, 0, ${period}) on conflict (generation_id, kind) do nothing`;
      await transaction`
        insert into usage_ledger (id, organization_id, account_id, generation_id, kind, units, cost, period_key)
        values (${randomUUID()}, ${generation.organization_id}, ${generation.account_id}, ${generation.id}, 'model_cost', 0,
          ${generation.reserved_cost}, ${period}) on conflict (generation_id, kind) do nothing`;
    }
    await transaction`
      update generations set status = 'failed', error_code = 'worker_lost', completed_at = now()
      where id = ${generation.id}`;
    await transaction`
      update usage_reservations set status = ${locked.status === 'running' ? 'reconciled' : 'released'}, reconciled_at = now()
      where generation_id = ${generation.id}`;
    await transaction`
      update tool_calls set status = 'failed', error_code = 'worker_lost', completed_at = now()
      where generation_id = ${generation.id} and status = 'running'`;
  }); } catch (error) { await recordMaintenanceFailure(sql, jobName, 'generation', generation.id, error); }
  await sql`delete from idempotency_keys where ctid in (select ctid from idempotency_keys where expires_at <= now() limit 500)`;
  await sql`delete from authentication_challenges where ctid in (
    select ctid from authentication_challenges
    where expires_at <= now() or consumed_at < now() - interval '1 day'
    order by created_at limit 500
  )`;
  maintenanceEvent({ event: jobName, outcome: 'completed', count: stale.length });
} catch (error) {
  if (!(error instanceof Error && error.message === 'LEASE_HELD')) throw error;
} finally {
  if (holder) await releaseMaintenanceLease(sql, jobName, holder);
  await sql.end();
}

import { randomUUID } from 'node:crypto';

export async function claimMaintenanceLease(sql, name, seconds = 300) {
  const holder = randomUUID();
  const rows = await sql`
    insert into maintenance_leases (name, holder, expires_at)
    values (${name}, ${holder}, now() + (${seconds}::text || ' seconds')::interval)
    on conflict (name) do update set holder = excluded.holder, expires_at = excluded.expires_at, updated_at = now()
      where maintenance_leases.expires_at <= now()
    returning holder`;
  return rows[0]?.holder === holder ? holder : undefined;
}

export async function releaseMaintenanceLease(sql, name, holder) {
  await sql`delete from maintenance_leases where name = ${name} and holder = ${holder}`;
}

export async function recordMaintenanceFailure(sql, jobName, itemType, itemId, error) {
  const errorCode = error && typeof error === 'object' && typeof error.code === 'string' ? error.code.slice(0, 100) : 'maintenance_failure';
  await sql`
    insert into maintenance_failures (id, job_name, item_type, item_id, error_code)
    values (${randomUUID()}, ${jobName}, ${itemType}, ${String(itemId)}, ${errorCode})
    on conflict (job_name, item_type, item_id) do update
      set error_code = excluded.error_code, attempts = maintenance_failures.attempts + 1, last_failed_at = now(), resolved_at = null`;
}

export function maintenanceEvent(event) {
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), service: 'scrolltastic-maintenance', ...event })}\n`);
}

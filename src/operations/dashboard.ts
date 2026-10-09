import { database } from '../persistence/postgres.js';

export interface StoryOperationsSummary {
  members: { role: string; count: number }[];
  usage: { tokens: number; cost: number };
  generations: { status: string; count: number }[];
  assets: { count: number; bytes: number };
  memory: { status: string; count: number }[];
  openMaintenanceFailures: number;
  limits: { dailyTokens: number; concurrentGenerations: number; maxOutputTokens: number };
  retention: { draftAssetDays?: number };
  recentAudit: { action: string; targetType: string; targetId: string; createdAt: string }[];
}

export async function storyOperationsSummary(storyId: string): Promise<StoryOperationsSummary> {
  const sql = database();
  if (!sql) throw new Error('Operations persistence is unavailable.');
  const rows = await sql<{ summary: StoryOperationsSummary }[]>`
    select jsonb_build_object(
      'members', coalesce((select jsonb_agg(x order by x.role) from (select role, count(*)::int from story_memberships where story_id = ${storyId}::uuid group by role) x), '[]'::jsonb),
      'usage', jsonb_build_object(
        'tokens', coalesce((select sum(ul.units)::bigint from usage_ledger ul join generations g on g.id = ul.generation_id join draft_workspaces dw on dw.id = g.workspace_id where dw.story_id = ${storyId}::uuid and ul.kind = 'model_tokens'), 0),
        'cost', coalesce((select sum(ul.cost)::float8 from usage_ledger ul join generations g on g.id = ul.generation_id join draft_workspaces dw on dw.id = g.workspace_id where dw.story_id = ${storyId}::uuid and ul.kind = 'model_cost'), 0)),
      'generations', coalesce((select jsonb_agg(x order by x.status) from (select g.status, count(*)::int from generations g join draft_workspaces dw on dw.id = g.workspace_id where dw.story_id = ${storyId}::uuid group by g.status) x), '[]'::jsonb),
      'assets', jsonb_build_object('count', (select count(*)::int from assets a join draft_workspaces dw on dw.id = a.workspace_id where dw.story_id = ${storyId}::uuid and a.retired_at is null), 'bytes', coalesce((select sum(a.bytes)::bigint from assets a join draft_workspaces dw on dw.id = a.workspace_id where dw.story_id = ${storyId}::uuid and a.retired_at is null), 0)),
      'memory', coalesce((select jsonb_agg(x order by x.status) from (select status, count(*)::int from story_memory where story_id = ${storyId}::uuid group by status) x), '[]'::jsonb),
      'openMaintenanceFailures', (select count(*)::int from maintenance_failures where resolved_at is null),
      'recentAudit', coalesce((select jsonb_agg(x order by x."createdAt" desc) from (select action, target_type as "targetType", target_id as "targetId", created_at as "createdAt" from audit_events where target_id = ${storyId} or metadata_json ->> 'storyId' = ${storyId} order by created_at desc limit 50) x), '[]'::jsonb)
    ) as summary`;
  return {
    ...rows[0].summary,
    limits: {
      dailyTokens: Number(process.env.SCROLLTASTIC_AI_DAILY_TOKEN_LIMIT ?? 100_000),
      concurrentGenerations: Number(process.env.SCROLLTASTIC_AI_CONCURRENCY ?? 2),
      maxOutputTokens: Number(process.env.SCROLLTASTIC_AI_MAX_OUTPUT_TOKENS ?? 2_048),
    },
    retention: { draftAssetDays: process.env.DRAFT_ASSET_RETENTION_DAYS ? Number(process.env.DRAFT_ASSET_RETENTION_DAYS) : undefined },
  };
}

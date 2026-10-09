import { randomUUID } from 'node:crypto';
import { database } from '../persistence/postgres.js';
import type { MemoryProposalInput, StoryMemoryRecord, SuppliedMemory } from './model.js';
import { selectMemoryWithinBudget, validateMemoryProposal } from './validation.js';

export class MemoryError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

function requiredDatabase() {
  const sql = database();
  if (!sql) throw new MemoryError('persistence_unavailable', 'Story memory persistence is unavailable.');
  return sql;
}

const columns = `id, story_id as "storyId", category, value_json as value, provenance_json as provenance,
  confidence::float8, status, scope_json as scope, source_revision_id as "sourceRevisionId", derived,
  created_by as "createdBy", reviewed_by as "reviewedBy", created_at as "createdAt",
  reviewed_at as "reviewedAt", invalidated_at as "invalidatedAt", updated_at as "updatedAt"`;

export async function listStoryMemory(storyId: string, status?: StoryMemoryRecord['status']): Promise<StoryMemoryRecord[]> {
  const sql = requiredDatabase();
  return status
    ? sql.unsafe<StoryMemoryRecord[]>(`select ${columns} from story_memory where story_id = $1::uuid and status = $2 order by created_at desc`, [storyId, status])
    : sql.unsafe<StoryMemoryRecord[]>(`select ${columns} from story_memory where story_id = $1::uuid order by created_at desc`, [storyId]);
}

export async function proposeStoryMemory(
  storyId: string,
  sourceRevisionId: string,
  accountId: string,
  proposal: unknown,
  generationId?: string,
): Promise<StoryMemoryRecord> {
  const input = validateMemoryProposal(proposal);
  const sql = requiredDatabase();
  const rows = await sql.unsafe<StoryMemoryRecord[]>(`insert into story_memory
    (id, story_id, category, value_json, provenance_json, confidence, status, scope_json, source_revision_id, derived, created_by)
    select $1, s.id, $2, $3::jsonb, $4::jsonb, $5,
      case when $7 and not exists (select 1 from draft_workspaces dw where dw.id = dr.workspace_id and dw.current_revision_id = dr.id and dw.status = 'active') then 'invalidated' else 'proposed' end,
      $6::jsonb, dr.id, $7, $8
    from stories s join draft_revisions dr on dr.story_id = s.id
    where s.id = $9::uuid and dr.id = $10::uuid
    returning ${columns}`, [randomUUID(), input.category, JSON.stringify(input.value), JSON.stringify({ evidence: input.evidence, reason: input.reason, ...(generationId ? { generationId } : {}) }), input.confidence, JSON.stringify(input.scope ?? []), Boolean(input.derived), accountId, storyId, sourceRevisionId]);
  if (!rows[0]) throw new MemoryError('invalid_source_revision', 'The source revision does not belong to this story.');
  return rows[0];
}

export async function reviewStoryMemory(
  storyId: string,
  memoryId: string,
  accountId: string,
  decision: 'approved' | 'rejected',
  editedValue?: unknown,
): Promise<StoryMemoryRecord> {
  if (!['approved', 'rejected'].includes(decision)) throw new MemoryError('invalid_decision', 'Memory must be approved or rejected.');
  let serialized: string | undefined;
  if (editedValue !== undefined) {
    serialized = JSON.stringify(editedValue);
    if (!serialized || serialized.length > 8_000) throw new MemoryError('invalid_value', 'The edited memory value is invalid or too large.');
  }
  const sql = requiredDatabase();
  const rows = await sql.unsafe<StoryMemoryRecord[]>(`update story_memory set status = $1,
      value_json = case when $2::jsonb is null then value_json else $2::jsonb end,
      reviewed_by = $3::uuid, reviewed_at = now(), updated_at = now()
    where id = $4::uuid and story_id = $5::uuid and status = 'proposed'
    returning ${columns}`, [decision, serialized ?? null, accountId, memoryId, storyId]);
  if (!rows[0]) throw new MemoryError('memory_not_reviewable', 'The memory proposal was not found or is no longer awaiting review.');
  return rows[0];
}

export async function memoryForGeneration(
  generationId: string,
  storyId: string,
  selectedId?: string,
  budget = 8_000,
): Promise<SuppliedMemory[]> {
  const sql = requiredDatabase();
  return sql.begin(async transaction => {
    const entries = await transaction<StoryMemoryRecord[]>`
      select id, category, value_json as value, confidence::float8, status, scope_json as scope
      from story_memory where story_id = ${storyId}::uuid and status = 'approved'
      order by created_at desc limit 256`;
    const selected = selectMemoryWithinBudget(entries, selectedId, budget);
    for (const entry of selected) await transaction`
      insert into generation_memory (generation_id, memory_id) values (${generationId}, ${entry.id}) on conflict do nothing`;
    return selected.map(({ id, category, value, confidence, scope }) => ({ id, category, value, confidence, scope }));
  });
}

export async function proposeGenerationMemory(generationId: string, proposals: unknown[]): Promise<{ memoryIds: string[] }> {
  if (!Array.isArray(proposals) || proposals.length < 1 || proposals.length > 12) throw new MemoryError('invalid_memory_proposals', 'Provide 1–12 memory proposals.');
  const sql = requiredDatabase();
  const target = await sql<{ storyId: string; revisionId: string; accountId: string }[]>`
    select dw.story_id as "storyId", g.base_revision_id as "revisionId", g.account_id as "accountId"
    from generations g join draft_workspaces dw on dw.id = g.workspace_id
    where g.id = ${generationId}::uuid and g.status = 'running'`;
  if (!target[0]) throw new MemoryError('generation_not_running', 'Memory can only be proposed during an active generation.');
  const records: StoryMemoryRecord[] = [];
  for (const proposal of proposals) records.push(await proposeStoryMemory(target[0].storyId, target[0].revisionId, target[0].accountId, proposal, generationId));
  return { memoryIds: records.map(record => record.id) };
}

export type { MemoryProposalInput };

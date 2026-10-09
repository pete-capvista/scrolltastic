import { createHash, randomUUID } from 'node:crypto';
import type { Principal } from '../auth/model.js';
import type { NormalizedStory } from '../model/normalized.js';
import { database } from '../persistence/postgres.js';
import { buildAuthoringContext, contextDigest, type AuthoringContext, type ContextAsset } from './context.js';
import type { ReadToolName } from './read-tools.js';
import type { AuthoringOperation } from '../authoring/patch.js';
import { applyPatchToWorkingDraft } from '../authoring/patch-service.js';
import { memoryForGeneration, proposeGenerationMemory } from '../memory/service.js';
import { logOperationalEvent } from '../observability/events.js';
import { generateDraftImage, type DraftAssetRecord } from '../authoring/asset-service.js';

const DEFAULT_MODEL = 'gpt-5.4-mini';
const MAX_PROMPT_CHARS = 12_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 2_048;
const DEFAULT_DAILY_TOKENS = 100_000;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_REQUESTS_PER_MINUTE = 20;

export type GenerationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export class GenerationError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface ConversationRecord { id: string; workspaceId: string; status: 'active' | 'closed'; createdAt: string }
export interface MessageRecord { id: string; sequence: number; role: 'user' | 'assistant'; parts: { type: 'text'; text: string }[]; generationId?: string; createdAt: string }
export interface GenerationRecord {
  id: string; workspaceId: string; conversationId: string; baseRevisionId: string; model: string; status: GenerationStatus;
  input: { prompt: string; selectedId?: string; selectedAssetIds?: string[]; mode?: 'assist' | 'publisher' };
  output?: { text: string; publishRequest?: PublishApprovalRequest; workingDraftUpdated?: boolean }; usage?: unknown; errorCode?: string;
  resultingRevisionId?: string;
  createdAt: string; startedAt?: string; completedAt?: string;
}

export interface GenerationRunnerResult {
  text: string; usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; finishReason?: string;
  actualCost?: number; providerGenerationIds?: string[]; publishRequest?: PublishApprovalRequest; workingDraftUpdated?: boolean;
}
export interface PublishApprovalRequest { revisionId: string; summary: string; approvalRequired: true; reviewUrl: string }
export interface GenerationRunnerInput {
  generationId: string; model: string; prompt: string; history: MessageRecord[]; context: AuthoringContext;
  mode: 'assist' | 'publisher'; maxOutputTokens: number; signal: AbortSignal;
  recordTool: (name: ReadToolName | 'generate_image' | 'propose_patch' | 'propose_memory_update' | 'request_publish_approval', input: Record<string, unknown>, run: () => Promise<unknown>) => Promise<unknown>;
  generateImage: (input: { prompt: string; aspect: 'square' | 'landscape' | 'portrait' }) => Promise<DraftAssetRecord & { revisedPrompt?: string }>;
  proposePatch: (input: { baseRevision: string; operations: AuthoringOperation[]; explanation: string }) => Promise<{ workingDraftUpdated: true; diff: unknown }>;
  proposeMemory: (input: { entries: unknown[] }) => Promise<{ memoryIds: string[] }>;
  requestPublishApproval: (input: { revisionId: string; summary: string }) => Promise<PublishApprovalRequest>;
}
export interface GenerationRunner { run(input: GenerationRunnerInput): Promise<GenerationRunnerResult> }

let defaultRunner: GenerationRunner | undefined;
const running = new Map<string, AbortController>();

function requiredDatabase() {
  const sql = database();
  if (!sql) throw new GenerationError('persistence_unavailable', 'Authoring persistence is unavailable.');
  return sql;
}

function integerSetting(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new GenerationError('configuration_error', `${name} must be a positive integer.`);
  return value;
}

function providerFailureDetails(error: unknown): Pick<
  Parameters<typeof logOperationalEvent>[0],
  'providerStatus' | 'providerCode' | 'providerType' | 'providerRequestId'
> {
  if (!error || typeof error !== 'object') return {};
  const value = error as Record<string, unknown>;
  const bounded = (field: unknown): string | undefined => typeof field === 'string' && field.length > 0
    ? field.slice(0, 200)
    : undefined;
  return {
    providerStatus: typeof value.status === 'number' && Number.isSafeInteger(value.status) ? value.status : undefined,
    providerCode: bounded(value.code),
    providerType: bounded(value.type),
    providerRequestId: bounded(value.request_id),
  };
}

export function generationModel(): string {
  const model = process.env.SCROLLTASTIC_AI_MODEL ?? DEFAULT_MODEL;
  const allowed = (process.env.SCROLLTASTIC_AI_MODELS ?? DEFAULT_MODEL).split(',').map(item => item.trim()).filter(Boolean);
  if (!allowed.includes(model) || !/^[a-z0-9][a-z0-9.-]*$/i.test(model)) throw new GenerationError('configuration_error', 'The configured OpenAI model is not allow-listed.');
  return model;
}

export function estimateGenerationTokens(prompt: string, maxOutputTokens: number): number {
  return Math.ceil(prompt.length / 4) + maxOutputTokens;
}

export function estimateGenerationCost(prompt: string, maxOutputTokens: number, model = generationModel()): number {
  const defaultPricing = model === DEFAULT_MODEL;
  const inputRate = Number(process.env.SCROLLTASTIC_AI_INPUT_USD_PER_MILLION ?? (defaultPricing ? 0.75 : Number.NaN));
  const outputRate = Number(process.env.SCROLLTASTIC_AI_OUTPUT_USD_PER_MILLION ?? (defaultPricing ? 4.5 : Number.NaN));
  if (!Number.isFinite(inputRate) || inputRate < 0 || !Number.isFinite(outputRate) || outputRate < 0) {
    throw new GenerationError('configuration_error', 'AI token pricing must be configured for the selected model.');
  }
  return Math.ceil(prompt.length / 4) / 1_000_000 * inputRate + maxOutputTokens / 1_000_000 * outputRate;
}

export async function createConversation(workspaceId: string, actor: Principal & { accountId: string }): Promise<ConversationRecord> {
  const sql = requiredDatabase();
  return sql.begin(async transaction => {
    await transaction`select pg_advisory_xact_lock(hashtext(${`conversation:${workspaceId}:${actor.accountId}`}))`;
    const existing = await transaction<ConversationRecord[]>`
      select id, workspace_id as "workspaceId", status, created_at as "createdAt" from conversations
      where workspace_id = ${workspaceId}::uuid and created_by = ${actor.accountId}::uuid and status = 'active'
      order by created_at desc limit 1`;
    if (existing[0]) return existing[0];
    const rows = await transaction<ConversationRecord[]>`
      insert into conversations (id, workspace_id, created_by, status)
      select ${randomUUID()}, dw.id, ${actor.accountId}, 'active' from draft_workspaces dw
      where dw.id = ${workspaceId}::uuid and dw.status = 'active'
      returning id, workspace_id as "workspaceId", status, created_at as "createdAt"`;
    if (!rows[0]) throw new GenerationError('workspace_inactive', 'A conversation requires an active workspace.');
    return rows[0];
  });
}

export async function conversationMessages(conversationId: string): Promise<MessageRecord[]> {
  return requiredDatabase()<MessageRecord[]>`
    select id, sequence, role, parts_json as parts, generation_id as "generationId", created_at as "createdAt"
    from messages where conversation_id = ${conversationId}::uuid order by sequence`;
}

export async function conversationWorkspace(conversationId: string): Promise<string | undefined> {
  const rows = await requiredDatabase()<{ workspaceId: string }[]>`
    select workspace_id as "workspaceId" from conversations where id = ${conversationId}::uuid`;
  return rows[0]?.workspaceId;
}

export async function generationRecord(generationId: string): Promise<GenerationRecord | undefined> {
  const rows = await requiredDatabase()<GenerationRecord[]>`
    select id, workspace_id as "workspaceId", conversation_id as "conversationId", base_revision_id as "baseRevisionId",
      model, status, input_json as input, output_json as output, usage_json as usage, error_code as "errorCode",
      resulting_revision_id as "resultingRevisionId",
      created_at as "createdAt", started_at as "startedAt", completed_at as "completedAt"
    from generations where id = ${generationId}::uuid`;
  return rows[0];
}

export async function createGeneration(
  conversationId: string,
  actor: Principal & { accountId: string },
  input: { prompt: unknown; selectedId?: unknown; selectedAssetIds?: unknown; mode?: unknown },
  idempotencyKey: string,
): Promise<{ generation: GenerationRecord; replayed: boolean }> {
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > MAX_PROMPT_CHARS) {
    throw new GenerationError('invalid_prompt', `A prompt of 1–${MAX_PROMPT_CHARS} characters is required.`);
  }
  if (input.selectedId !== undefined && (typeof input.selectedId !== 'string' || input.selectedId.length > 200)) {
    throw new GenerationError('invalid_selection', 'The selected element ID is invalid.');
  }
  const prompt = input.prompt.trim();
  const selectedId = typeof input.selectedId === 'string' ? input.selectedId : undefined;
  if (input.selectedAssetIds !== undefined && (!Array.isArray(input.selectedAssetIds) || input.selectedAssetIds.length > 16
    || input.selectedAssetIds.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)))) {
    throw new GenerationError('invalid_asset_selection', 'Select at most 16 valid draft assets.');
  }
  const selectedAssetIds = [...new Set((input.selectedAssetIds as string[] | undefined) ?? [])];
  if (input.mode !== undefined && input.mode !== 'assist' && input.mode !== 'publisher') throw new GenerationError('invalid_mode', 'The assistant mode is invalid.');
  const mode = input.mode === 'publisher' ? 'publisher' : 'assist';
  const model = generationModel();
  const maxOutputTokens = integerSetting('SCROLLTASTIC_AI_MAX_OUTPUT_TOKENS', DEFAULT_MAX_OUTPUT_TOKENS);
  const reservedTokens = estimateGenerationTokens(prompt, maxOutputTokens);
  const reservedCost = estimateGenerationCost(prompt, maxOutputTokens, model);
  const dailyLimit = integerSetting('SCROLLTASTIC_AI_DAILY_TOKEN_LIMIT', DEFAULT_DAILY_TOKENS);
  const concurrencyLimit = integerSetting('SCROLLTASTIC_AI_CONCURRENCY', DEFAULT_CONCURRENCY);
  const requestsPerMinute = integerSetting('SCROLLTASTIC_AI_REQUESTS_PER_MINUTE', DEFAULT_REQUESTS_PER_MINUTE);
  const sql = requiredDatabase();
  const generationId = randomUUID();
  const reservationId = randomUUID();
  const messageId = randomUUID();
  const periodKey = new Date().toISOString().slice(0, 10);
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey)) throw new GenerationError('invalid_idempotency_key', 'A valid idempotency key is required.');
  const scope = `generation:${conversationId}`;
  const requestDigest = createHash('sha256').update(JSON.stringify({ prompt, selectedId, selectedAssetIds, mode })).digest('hex');

  const allocation = await sql.begin(async transaction => {
    const rows = await transaction<{
      workspace_id: string; organization_id: string; current_revision_id: string; status: string; conversation_status: string; ai_enabled: boolean;
    }[]>`
      select c.workspace_id, s.organization_id, dw.current_revision_id, dw.status, c.status as conversation_status,
        coalesce((dw.working_document_json #>> '{authoring,ai,enabled}')::boolean, false) as ai_enabled
      from conversations c join draft_workspaces dw on dw.id = c.workspace_id join stories s on s.id = dw.story_id
      where c.id = ${conversationId}::uuid and c.created_by = ${actor.accountId}::uuid for update of c`;
    const target = rows[0];
    if (!target || target.status !== 'active' || target.conversation_status !== 'active') throw new GenerationError('conversation_inactive', 'This conversation is not active.');
    if (!target.ai_enabled) throw new GenerationError('ai_disabled', 'AI authoring is not enabled by this story document.');
    if (selectedAssetIds.length) {
      const selectedAssets = await transaction<{ id: string }[]>`
        select id from assets where workspace_id = ${target.workspace_id}::uuid
          and id in ${transaction(selectedAssetIds)} and scan_status = 'approved' and retired_at is null`;
      if (selectedAssets.length !== selectedAssetIds.length) throw new GenerationError('invalid_asset_selection', 'One or more selected assets are unavailable.');
    }
    const claimed = await transaction<{ key: string }[]>`
      insert into idempotency_keys (principal_id, scope, key, request_digest, status, expires_at)
      values (${actor.accountId}, ${scope}, ${idempotencyKey}, ${requestDigest}, 'pending', now() + interval '24 hours')
      on conflict do nothing returning key`;
    if (!claimed[0]) {
      const existing = await transaction<{ request_digest: string; response_json?: { generationId?: string } }[]>`
        select request_digest, response_json from idempotency_keys
        where principal_id = ${actor.accountId}::uuid and scope = ${scope} and key = ${idempotencyKey} for update`;
      if (existing[0]?.request_digest !== requestDigest) throw new GenerationError('idempotency_conflict', 'This idempotency key was used for a different request.');
      const existingId = existing[0]?.response_json?.generationId;
      if (!existingId) throw new GenerationError('request_in_progress', 'The original generation request is still being allocated.');
      return { generationId: existingId, replayed: true };
    }
    await transaction`select pg_advisory_xact_lock(hashtext(${`ai-budget:${target.organization_id}`}))`;
    const usage = await transaction<{ used: number; reserved: number; active: number; recent: number }[]>`
      select
        coalesce((select sum(units)::bigint from usage_ledger where organization_id = ${target.organization_id}::uuid and period_key = ${periodKey} and kind = 'model_tokens'), 0)::int as used,
        coalesce((select sum(reserved_units)::bigint from usage_reservations where organization_id = ${target.organization_id}::uuid and status = 'active' and expires_at > now()), 0)::int as reserved,
        (select count(*)::int from generations where workspace_id = ${target.workspace_id}::uuid and status in ('pending', 'running')) as active,
        (select count(*)::int from generations where account_id = ${actor.accountId}::uuid and created_at > now() - interval '1 minute') as recent`;
    if (usage[0].recent >= requestsPerMinute) throw new GenerationError('generation_rate_limit', 'This account has reached its AI request rate limit.');
    if (usage[0].active >= concurrencyLimit) throw new GenerationError('generation_concurrency', 'This workspace has reached its concurrent generation limit.');
    if (usage[0].used + usage[0].reserved + reservedTokens > dailyLimit) throw new GenerationError('generation_quota', 'The organization has reached its daily AI token limit.');
    const sequenceRows = await transaction<{ sequence: number }[]>`
      select coalesce(max(sequence), -1)::int + 1 as sequence from messages where conversation_id = ${conversationId}::uuid`;
    const request = { prompt, ...(selectedId ? { selectedId } : {}), ...(selectedAssetIds.length ? { selectedAssetIds } : {}), mode };
    await transaction`
      insert into generations
        (id, workspace_id, conversation_id, account_id, base_revision_id, model, status, prompt_digest, input_json)
      values (${generationId}, ${target.workspace_id}, ${conversationId}, ${actor.accountId}, ${target.current_revision_id}, ${model},
        'pending', ${createHash('sha256').update(prompt).digest('hex')}, ${transaction.json(request)})`;
    await transaction`update generations set estimated_cost = ${reservedCost} where id = ${generationId}`;
    await transaction`
      insert into messages (id, conversation_id, sequence, role, parts_json, generation_id)
      values (${messageId}, ${conversationId}, ${sequenceRows[0].sequence}, 'user', ${transaction.json([{ type: 'text', text: prompt }])}, ${generationId})`;
    await transaction`
      insert into usage_reservations (id, generation_id, organization_id, reserved_units, reserved_cost, status, expires_at)
      values (${reservationId}, ${generationId}, ${target.organization_id}, ${reservedTokens}, ${reservedCost}, 'active', now() + interval '15 minutes')`;
    await transaction`
      update idempotency_keys set status = 'completed', response_json = ${transaction.json({ generationId })}
      where principal_id = ${actor.accountId}::uuid and scope = ${scope} and key = ${idempotencyKey}`;
    await transaction`
      insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
      values (${randomUUID()}, ${target.organization_id}, ${actor.accountId}, 'generation.create', 'generation', ${generationId},
        ${transaction.json({ conversationId, workspaceId: target.workspace_id, model, mode, baseRevisionId: target.current_revision_id })})`;
    return { generationId, replayed: false };
  });
  return { generation: (await generationRecord(allocation.generationId))!, replayed: allocation.replayed };
}

async function requestPublishApproval(generationId: string, revisionId: string, summary: string): Promise<PublishApprovalRequest> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(revisionId)) throw new GenerationError('invalid_revision', 'A valid revision ID is required.');
  const normalizedSummary = summary.trim();
  if (!normalizedSummary || normalizedSummary.length > 1_000) throw new GenerationError('invalid_publish_summary', 'A concise publish summary is required.');
  const sql = requiredDatabase();
  return sql.begin(async transaction => {
    const rows = await transaction<{ workspace_id: string; story_id: string; organization_id: string; account_id: string; current_revision_id: string; status: string; mode?: string; has_pending_changes: boolean }[]>`
      select g.workspace_id, s.id as story_id, s.organization_id, g.account_id, dw.current_revision_id, dw.status,
        g.input_json ->> 'mode' as mode, jsonb_array_length(dw.working_operations_json) > 0 as has_pending_changes
      from generations g join draft_workspaces dw on dw.id = g.workspace_id join stories s on s.id = dw.story_id
      where g.id = ${generationId}::uuid for update of dw`;
    const target = rows[0];
    if (!target || target.mode !== 'publisher') throw new GenerationError('publisher_mode_required', 'Publisher mode is required to request publication.');
    if (target.has_pending_changes) throw new GenerationError('pending_changes', 'Accept the working draft changes before requesting publication.');
    if (target.status !== 'active' || target.current_revision_id !== revisionId) throw new GenerationError('stale_publish_request', 'Only the current active revision can be requested for publication.');
    const revisions = await transaction<{ id: string }[]>`
      select id from draft_revisions where id = ${revisionId}::uuid and workspace_id = ${target.workspace_id}::uuid`;
    if (!revisions[0]) throw new GenerationError('invalid_revision', 'The requested revision does not belong to this workspace.');
    await transaction`
      insert into audit_events (id, organization_id, actor_id, action, target_type, target_id, metadata_json)
      values (${randomUUID()}, ${target.organization_id}, ${target.account_id}, 'publish.approval-request', 'revision', ${revisionId},
        ${transaction.json({ generationId, workspaceId: target.workspace_id, summary: normalizedSummary })})`;
    return {
      revisionId, summary: normalizedSummary, approvalRequired: true as const,
      reviewUrl: `/s/${target.story_id}/edit/${target.workspace_id}/r/${revisionId}`,
    };
  });
}

async function generationContext(generationId: string): Promise<{ record: GenerationRecord; context: AuthoringContext; history: MessageRecord[]; organizationId: string; accountId: string }> {
  const sql = requiredDatabase();
  const rows = await sql<{
    record: GenerationRecord; document: NormalizedStory; assets: ContextAsset[]; organizationId: string; accountId: string; storyId: string;
  }[]>`
    select jsonb_build_object('id', g.id, 'workspaceId', g.workspace_id, 'conversationId', g.conversation_id,
      'baseRevisionId', g.base_revision_id, 'model', g.model, 'status', g.status, 'input', g.input_json,
      'createdAt', g.created_at) as record, dw.working_document_json as document, s.organization_id as "organizationId", g.account_id as "accountId", s.id as "storyId",
      coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'logicalPath', a.logical_path, 'mediaType', a.media_type,
        'width', a.width, 'height', a.height, 'digest', a.digest) order by a.created_at desc)
        from assets a where a.workspace_id = g.workspace_id and a.scan_status = 'approved' and a.retired_at is null), '[]'::jsonb) as assets
    from generations g join draft_workspaces dw on dw.id = g.workspace_id join stories s on s.id = dw.story_id
    where g.id = ${generationId}::uuid`;
  const row = rows[0];
  if (!row) throw new GenerationError('not_found', 'Generation not found.');
  const history = (await conversationMessages(row.record.conversationId)).filter(message => message.generationId !== generationId).slice(-20);
  const memory = await memoryForGeneration(generationId, row.storyId, row.record.input.selectedId, integerSetting('SCROLLTASTIC_AI_MEMORY_CONTEXT_CHARS', 8_000));
  return {
    record: row.record, context: buildAuthoringContext(row.document, row.record.baseRevisionId, row.assets, row.record.input.selectedId, memory, row.record.input.selectedAssetIds),
    history, organizationId: row.organizationId, accountId: row.accountId,
  };
}

async function runner(): Promise<GenerationRunner> {
  defaultRunner ??= (await import('./read-agent.js')).readOnlyAgentRunner;
  return defaultRunner;
}

export function setGenerationRunnerForTests(value: GenerationRunner | undefined): void { defaultRunner = value; }

async function reconcileReservedEstimate(generationId: string, charge: boolean): Promise<void> {
  const sql = requiredDatabase();
  await sql.begin(async transaction => {
    const rows = await transaction<{
      status: string; reserved_units: number; reserved_cost: number; organization_id: string; account_id: string;
    }[]>`
      select ur.status, ur.reserved_units::int, ur.reserved_cost::float8, ur.organization_id, g.account_id
      from usage_reservations ur join generations g on g.id = ur.generation_id
      where ur.generation_id = ${generationId}::uuid for update of ur`;
    const reservation = rows[0];
    if (!reservation || reservation.status !== 'active') return;
    if (charge) {
      const period = new Date().toISOString().slice(0, 10);
      await transaction`
        insert into usage_ledger (id, organization_id, account_id, generation_id, kind, units, cost, period_key)
        values (${randomUUID()}, ${reservation.organization_id}, ${reservation.account_id}, ${generationId}, 'model_tokens',
          ${reservation.reserved_units}, 0, ${period}) on conflict (generation_id, kind) do nothing`;
      await transaction`
        insert into usage_ledger (id, organization_id, account_id, generation_id, kind, units, cost, period_key)
        values (${randomUUID()}, ${reservation.organization_id}, ${reservation.account_id}, ${generationId}, 'model_cost', 0,
          ${reservation.reserved_cost}, ${period}) on conflict (generation_id, kind) do nothing`;
      await transaction`update usage_reservations set status = 'reconciled', reconciled_at = now() where generation_id = ${generationId}`;
    } else await transaction`update usage_reservations set status = 'released', reconciled_at = now() where generation_id = ${generationId}`;
  });
}

export async function runGeneration(generationId: string, override?: GenerationRunner): Promise<void> {
  const sql = requiredDatabase();
  const claimed = await sql<{ id: string }[]>`
    update generations set status = 'running', started_at = now()
    where id = ${generationId}::uuid and status = 'pending' returning id`;
  if (!claimed[0]) return;
  const started = Date.now();
  logOperationalEvent({ event: 'generation.run', outcome: 'started', generationId });
  const controller = new AbortController(); running.set(generationId, controller);
  try {
    const item = await generationContext(generationId);
    const digest = contextDigest(item.context);
    await sql`update generations set context_digest = ${digest} where id = ${generationId}`;
    let toolSequence = 0;
    const recordTool: GenerationRunnerInput['recordTool'] = async (name, input, execute) => {
      const id = randomUUID(); const sequence = toolSequence++;
      await sql`insert into tool_calls (id, generation_id, sequence, tool_name, input_json, status) values (${id}, ${generationId}, ${sequence}, ${name}, ${sql.json(JSON.parse(JSON.stringify(input)))}, 'running')`;
      try {
        const output = await execute();
        await sql`update tool_calls set status = 'completed', output_json = ${sql.json(output as never)}, completed_at = now() where id = ${id}`;
        return output;
      } catch (error) {
        const code = error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
          ? String((error as { code: string }).code).slice(0, 100) : 'tool_failure';
        await sql`update tool_calls set status = 'failed', error_code = ${code}, completed_at = now() where id = ${id}`;
        throw error;
      }
    };
    const result = await (override ?? await runner()).run({
      generationId, model: item.record.model, prompt: item.record.input.prompt, history: item.history, context: item.context,
      mode: item.record.input.mode === 'publisher' ? 'publisher' : 'assist',
      maxOutputTokens: integerSetting('SCROLLTASTIC_AI_MAX_OUTPUT_TOKENS', DEFAULT_MAX_OUTPUT_TOKENS), signal: controller.signal, recordTool,
      proposePatch: proposal => applyPatchToWorkingDraft({
        generationId, baseRevisionId: proposal.baseRevision, operations: proposal.operations, explanation: proposal.explanation,
      }),
      generateImage: request => generateDraftImage(generationId, request),
      proposeMemory: proposal => proposeGenerationMemory(generationId, proposal.entries),
      requestPublishApproval: request => requestPublishApproval(generationId, request.revisionId, request.summary),
    });
    const latest = await generationRecord(generationId);
    if (latest?.status === 'cancelled') return;
    const totalTokens = result.usage.totalTokens ?? (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0);
    await sql.begin(async transaction => {
      const sequenceRows = await transaction<{ sequence: number }[]>`
        select coalesce(max(sequence), -1)::int + 1 as sequence from messages where conversation_id = ${item.record.conversationId}::uuid`;
      await transaction`
        insert into messages (id, conversation_id, sequence, role, parts_json, generation_id)
        values (${randomUUID()}, ${item.record.conversationId}, ${sequenceRows[0].sequence}, 'assistant',
          ${transaction.json([{ type: 'text', text: result.text }])}, ${generationId})`;
      await transaction`
        update generations set status = 'completed', output_json = ${transaction.json({
          text: result.text,
          ...(result.finishReason ? { finishReason: result.finishReason } : {}),
          ...(result.providerGenerationIds ? { providerGenerationIds: result.providerGenerationIds } : {}),
          ...(result.publishRequest ? { publishRequest: result.publishRequest } : {}),
          ...(result.workingDraftUpdated ? { workingDraftUpdated: true } : {}),
        } as never)},
          usage_json = ${transaction.json(result.usage)}, actual_cost = ${result.actualCost ?? null}, latency_ms = ${Date.now() - started}, completed_at = now()
        where id = ${generationId} and status = 'running'`;
      await transaction`
        insert into usage_ledger (id, organization_id, account_id, generation_id, kind, units, cost, period_key)
        values (${randomUUID()}, ${item.organizationId}, ${item.accountId}, ${generationId}, 'model_tokens', ${totalTokens}, 0,
          ${new Date().toISOString().slice(0, 10)})`;
      await transaction`
        insert into usage_ledger (id, organization_id, account_id, generation_id, kind, units, cost, period_key)
        values (${randomUUID()}, ${item.organizationId}, ${item.accountId}, ${generationId}, 'model_cost', 0, ${result.actualCost ?? 0},
          ${new Date().toISOString().slice(0, 10)})`;
      await transaction`update usage_reservations set status = 'reconciled', reconciled_at = now() where generation_id = ${generationId}`;
    });
    logOperationalEvent({ event: 'generation.run', outcome: 'completed', generationId, durationMs: Date.now() - started });
  } catch (error) {
    const cancelled = controller.signal.aborted;
    await sql.begin(async transaction => {
      await transaction`
        update generations set status = ${cancelled ? 'cancelled' : 'failed'}, error_code = ${cancelled ? 'cancelled' : 'provider_failure'},
          latency_ms = ${Date.now() - started}, completed_at = now() where id = ${generationId} and status in ('running', 'pending')`;
    });
    await reconcileReservedEstimate(generationId, true);
    logOperationalEvent({
      event: 'generation.run', outcome: cancelled ? 'skipped' : 'failed', generationId,
      durationMs: Date.now() - started, errorCode: cancelled ? 'cancelled' : 'provider_failure',
      ...(!cancelled ? providerFailureDetails(error) : {}),
    });
    if (!cancelled) throw error;
  } finally { running.delete(generationId); }
}

export async function cancelGeneration(generationId: string): Promise<boolean> {
  running.get(generationId)?.abort();
  const sql = requiredDatabase();
  const previous = await sql.begin(async transaction => {
    const rows = await transaction<{ status: GenerationStatus }[]>`
      select status from generations where id = ${generationId}::uuid for update`;
    if (!rows[0] || !['pending', 'running'].includes(rows[0].status)) return undefined;
    await transaction`
      update generations set status = 'cancelled', error_code = 'cancelled', completed_at = now() where id = ${generationId}::uuid`;
    return rows[0].status;
  });
  if (previous) await reconcileReservedEstimate(generationId, previous === 'running');
  return Boolean(previous);
}

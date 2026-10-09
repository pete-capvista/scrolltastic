import { MEMORY_CATEGORIES, type MemoryProposalInput } from './model.js';

export class MemoryValidationError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const MAX_VALUE_CHARS = 8_000;
const MAX_SCOPE = 64;

export function validateMemoryProposal(value: unknown): MemoryProposalInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MemoryValidationError('invalid_memory', 'A memory proposal object is required.');
  const input = value as Record<string, unknown>;
  if (!MEMORY_CATEGORIES.includes(input.category as never)) throw new MemoryValidationError('invalid_category', 'The memory category is invalid.');
  let serialized: string;
  try { serialized = JSON.stringify(input.value); } catch { throw new MemoryValidationError('invalid_value', 'The memory value must be JSON serializable.'); }
  if (!serialized || serialized.length > MAX_VALUE_CHARS) throw new MemoryValidationError('invalid_value', `The memory value must be at most ${MAX_VALUE_CHARS} characters.`);
  if (typeof input.evidence !== 'string' || !input.evidence.trim() || input.evidence.length > 2_000) throw new MemoryValidationError('invalid_evidence', 'Evidence of 1–2000 characters is required.');
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 1_000) throw new MemoryValidationError('invalid_reason', 'A reason of 1–1000 characters is required.');
  if (typeof input.confidence !== 'number' || !Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) throw new MemoryValidationError('invalid_confidence', 'Confidence must be between 0 and 1.');
  const scope = input.scope === undefined ? [] : input.scope;
  if (!Array.isArray(scope) || scope.length > MAX_SCOPE || scope.some(item => typeof item !== 'string' || !item || item.length > 200)) throw new MemoryValidationError('invalid_scope', 'Memory scope must contain at most 64 stable IDs.');
  return {
    category: input.category as MemoryProposalInput['category'], value: input.value,
    evidence: input.evidence.trim(), reason: input.reason.trim(), confidence: input.confidence,
    scope: [...new Set(scope as string[])], derived: input.category === 'derived' || input.derived === true,
  };
}

export function selectMemoryWithinBudget(entries: readonly StoryMemoryRecordLike[], selectedId: string | undefined, budget: number): StoryMemoryRecordLike[] {
  if (!Number.isSafeInteger(budget) || budget < 2) return [];
  const relevant = entries.filter(entry => entry.status === 'approved' && (!entry.scope.length || (selectedId ? entry.scope.includes(selectedId) : true)))
    .sort((a, b) => Number(Boolean(selectedId && b.scope.includes(selectedId))) - Number(Boolean(selectedId && a.scope.includes(selectedId))) || b.confidence - a.confidence || a.id.localeCompare(b.id));
  const selected: StoryMemoryRecordLike[] = [];
  let used = 2;
  for (const entry of relevant) {
    const size = JSON.stringify({ id: entry.id, category: entry.category, value: entry.value, confidence: entry.confidence, scope: entry.scope }).length + (selected.length ? 1 : 0);
    if (used + size > budget) continue;
    selected.push(entry); used += size;
  }
  return selected;
}

type StoryMemoryRecordLike = Pick<import('./model.js').StoryMemoryRecord, 'id' | 'category' | 'value' | 'confidence' | 'scope' | 'status'>;

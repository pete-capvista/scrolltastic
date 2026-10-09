import { describe, expect, it } from 'vitest';
import type { StoryMemoryRecord } from '../src/memory/model';
import { MemoryValidationError, selectMemoryWithinBudget, validateMemoryProposal } from '../src/memory/validation';

function memory(id: string, overrides: Partial<StoryMemoryRecord> = {}): StoryMemoryRecord {
  return {
    id, storyId: 'story', category: 'canon', value: { fact: id }, provenance: { evidence: 'panel', reason: 'continuity' },
    confidence: 0.8, status: 'approved', scope: [], derived: false, createdBy: 'account', createdAt: '', updatedAt: '', ...overrides,
  };
}

describe('reviewed story memory', () => {
  it('validates bounded proposals and makes derived category revision-derived', () => {
    expect(validateMemoryProposal({ category: 'derived', value: { summary: 'A' }, evidence: 'panel-a', reason: 'Index it', confidence: 0.9 })).toMatchObject({ derived: true, scope: [] });
    expect(() => validateMemoryProposal({ category: 'canon', value: 'x', evidence: '', reason: 'x', confidence: 2 })).toThrow(MemoryValidationError);
  });

  it('retrieves only approved relevant entries in deterministic priority and budget order', () => {
    const entries = [
      memory('global', { confidence: 1 }), memory('selected', { confidence: 0.5, scope: ['panel-a'] }),
      memory('other', { confidence: 1, scope: ['panel-b'] }), memory('proposed', { status: 'proposed' }),
    ];
    expect(selectMemoryWithinBudget(entries, 'panel-a', 1_000).map(entry => entry.id)).toEqual(['selected', 'global']);
    expect(selectMemoryWithinBudget(entries, 'panel-a', 80)).toHaveLength(0);
  });
});

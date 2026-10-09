import { describe, expect, it } from 'vitest';
import { commitBlock, replayRebaseOperations, validatedRevision } from '../src/authoring/revisions';

const document = {
  storyLanguage: '5', id: '550e8400-e29b-41d4-a716-446655440000', title: 'Draft',
  body: { containers: [{ type: 'container', id: 'container', flow: [{ type: 'panel', id: 'panel', frames: [{ type: 'narrative', text: 'Hello' }] }] }] },
};

describe('immutable draft revision contract', () => {
  it('validates and hashes canonical complete documents deterministically', () => {
    const first = validatedRevision(document);
    const second = validatedRevision(structuredClone(document));
    expect(first.digest).toBe(second.digest);
    expect(first.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(new TextDecoder().decode(first.bytes)).toBe(`${JSON.stringify(first.document, null, 2)}\n`);
    expect(() => validatedRevision({ ...document, storyLanguage: '6' })).toThrow();
  });

  it.each([
    [{ workspaceStatus: 'closed' }, 'workspace_inactive'],
    [{ currentRevisionId: 'other' }, 'stale_revision'],
    [{ hasPendingChanges: true }, 'pending_changes'],
    [{ acknowledgedRevisionId: undefined }, 'preview_required'],
    [{ revisionValid: false }, 'invalid_revision'],
    [{ productionEtag: 'new' }, 'revision_conflict'],
  ] as const)('blocks commit when %j', (patch, expected) => {
    const state = {
      workspaceStatus: 'active' as const, currentRevisionId: 'revision', acknowledgedRevisionId: 'revision',
      baseEtag: 'base', productionEtag: 'base', revisionValid: true, ...patch,
    };
    expect(commitBlock(state, 'revision')).toBe(expected);
  });

  it('accepts only the acknowledged current valid revision on the unchanged base', () => {
    expect(commitBlock({
      workspaceStatus: 'active', currentRevisionId: 'revision', acknowledgedRevisionId: 'revision',
      baseEtag: 'base', productionEtag: 'base', revisionValid: true,
    }, 'revision')).toBeUndefined();
  });

  it('rebases only explicitly supported deterministic operations', () => {
    expect(replayRebaseOperations(document, [null, { type: 'test-title', title: 'Rebased' }]).document.title).toBe('Rebased');
    expect(replayRebaseOperations(document, [{
      type: 'ai-patch', operations: [{ type: 'set-property', targetId: document.id, property: 'title', expected: 'Draft', value: 'AI Replayed' }],
    }]).document.title).toBe('AI Replayed');
    expect(() => replayRebaseOperations(document, [{ type: 'restore', sourceRevisionId: 'old' }])).toThrow('cannot safely replay');
  });
});

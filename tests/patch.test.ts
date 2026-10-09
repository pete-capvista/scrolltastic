import { describe, expect, it } from 'vitest';
import { applyAuthoringOperations, PatchError, type AuthoringOperation } from '../src/authoring/patch';
import { validatedRevision } from '../src/authoring/revisions';

const document = {
  storyLanguage: '5', id: '550e8400-e29b-41d4-a716-446655440000', title: 'Draft',
  body: { containers: [{ type: 'container', id: 'container', flow: [
    { type: 'panel', id: 'panel-one', frames: [{ type: 'narrative', id: 'note', text: 'Before' }] },
    { type: 'panel', id: 'panel-two', frames: [{ type: 'narrative', id: 'other-note', text: 'Other' }] },
  ] }] },
};

describe('typed preconditioned authoring patches', () => {
  it('applies property and child operations immutably and remains valid V5', () => {
    const operations: AuthoringOperation[] = [
      { type: 'set-property', targetId: 'note', property: 'text', expected: 'Before', value: 'After' },
      { type: 'insert-child', parentId: 'panel-one', collection: 'frames', expectedBeforeId: null, child: { type: 'narrative', id: 'second-note', text: 'Second' } },
      { type: 'move-child', parentId: 'container', collection: 'flow', targetId: 'panel-two', expectedIndex: 1, beforeId: 'panel-one' },
      { type: 'remove-child', parentId: 'panel-one', collection: 'frames', targetId: 'second-note', expected: { type: 'narrative', id: 'second-note', text: 'Second' } },
    ];
    const result = applyAuthoringOperations(document, operations);
    expect(document.body.containers[0].flow[0].id).toBe('panel-one');
    expect(result.document).toMatchObject({ body: { containers: [{ flow: [{ id: 'panel-two' }, { frames: [{ text: 'After' }] }] }] } });
    expect(validatedRevision(result.document).document.title).toBe('Draft');
    expect(result.diff).toHaveLength(4);
  });

  it.each([
    { type: 'set-property', targetId: 'note', property: 'id', expected: 'note', value: 'other' },
    { type: 'set-property', targetId: '550e8400-e29b-41d4-a716-446655440000', property: 'storyLanguage', expected: '5', value: '6' },
    { type: 'set-property', targetId: 'note', property: '__proto__', expected: null, value: {} },
    { type: 'set-property', targetId: 'note', property: 'unknownFutureField', expected: null, value: true },
  ] as AuthoringOperation[])('rejects protected or non-present property mutation %#', operation => {
    expect(() => applyAuthoringOperations(document, [operation])).toThrow(PatchError);
    expect(document.body.containers[0].flow[0].frames[0].text).toBe('Before');
  });

  it('rejects stale values, stale indices, unresolved IDs, duplicate IDs, and wrong parents', () => {
    const invalid: AuthoringOperation[] = [
      { type: 'set-property', targetId: 'note', property: 'text', expected: 'Old', value: 'After' },
      { type: 'move-child', parentId: 'container', collection: 'flow', targetId: 'panel-two', expectedIndex: 0, beforeId: null },
      { type: 'remove-child', parentId: 'panel-one', collection: 'frames', targetId: 'missing', expected: null },
      { type: 'insert-child', parentId: 'panel-one', collection: 'frames', expectedBeforeId: null, child: { type: 'narrative', id: 'note', text: 'Duplicate' } },
      { type: 'insert-child', parentId: 'note', collection: 'flow', expectedBeforeId: null, child: { type: 'panel', id: 'third', frames: [] } },
    ];
    for (const operation of invalid) expect(() => applyAuthoringOperations(document, [operation])).toThrow(PatchError);
  });

  it('fails closed across fuzzed path-like property names', () => {
    const names = ['../id', '/body', 'frames[0]', 'constructor', 'prototype', '', 'a-b', '💥'];
    for (const property of names) {
      expect(() => applyAuthoringOperations(document, [{ type: 'set-property', targetId: 'note', property, expected: null, value: 'x' }]))
        .toThrow(PatchError);
    }
    expect(document).not.toHaveProperty('polluted');
  });
});

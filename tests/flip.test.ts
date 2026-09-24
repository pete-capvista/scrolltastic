import { expect, it } from 'vitest';
import { canClaimFlip, flipDirection, isFlip } from '../src/inputs/flip-gesture';
import { parseStory, StoryValidationError } from '../src/parser/parse';

const start = { x: 100, y: 400, time: 1000 };
it('maps a quick vertical flick to native document direction', () => {
  const up = { x: 103, y: 352, time: 1080 };
  expect(canClaimFlip(start, up)).toBe(true);
  expect(isFlip(start, up)).toBe(true);
  expect(flipDirection(start, up)).toBe('advance');
  expect(flipDirection(start, { ...up, y: 448 })).toBe('reverse');
});
it('leaves taps, slow drags, horizontal gestures, and long travel out of Flip', () => {
  for (const point of [
    { x: 100, y: 399, time: 1050 },
    { x: 100, y: 352, time: 1500 },
    { x: 200, y: 352, time: 1080 },
    { x: 100, y: 200, time: 1100 },
    { x: 100, y: 352, time: 1000 },
  ]) {
    expect(canClaimFlip(start, point)).toBe(false);
    expect(isFlip(start, point)).toBe(false);
  }
  expect(canClaimFlip(start, { x: 100, y: 352, time: 1200 })).toBe(false);
});
it('requires 0.12 and visible controls for Flip, while preserving older input contracts', () => {
  const body = {
    id: '550e8400-e29b-41d4-a716-446655440000', title: 'Flip',
    interaction: { advance: { enabled: true, mode: 'beats', inputs: ['controls', 'keyboard', 'flip'] } },
    containers: [{ type: 'container', id: 'c', flow: [{ type: 'panel', id: 'p', beat: { id: 'b' }, frames: [{ type: 'narrative', text: 'Hello' }] }] }],
  };
  expect(parseStory({ version: '0.12', body }).body.interaction?.advance.inputs).toContain('flip');
  expect(() => parseStory({ version: '0.11', body })).toThrow('Flip input requires document version 0.12');
  for (const inputs of [['flip'], ['controls', 'flip', 'flip'], ['controls', 'unknown']]) {
    const copy = structuredClone(body); copy.interaction.advance.inputs = inputs;
    expect(() => parseStory({ version: '0.12', body: copy })).toThrow(StoryValidationError);
  }
});

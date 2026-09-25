import { describe, expect, it } from 'vitest';
import { elementCoordinate, orderBeats, pinDisplacement, timelineCoordinate } from '../src/beats/resolve';
import { parseStory, StoryValidationError } from '../src/parser/parse';
import { readFileSync } from 'node:fs';

const cardStory = () => {
  const story = JSON.parse(readFileSync('public/stories/c6c6bfa1-145e-4d68-a2fd-cc94107b46ea/story.json', 'utf8'));

  delete story.body.interaction;
  return story;
};
const firstPanel = (story: ReturnType<typeof cardStory>) => story.body.containers[0].flow[0];
const transition = (story: ReturnType<typeof cardStory>) => firstPanel(story).frames[1].artwork.transition;

describe('Beat language', () => {
  it('accepts all Element Beat owners and signed supported offsets without mutating input', () => {
    for (const offset of ['0', '8px', '-8rem', '2vw', '-2vh', '8svh', '-8dvh']) {
      const story = cardStory();
      firstPanel(story).beat.offset = offset;
      const before = structuredClone(story);
      expect(parseStory(story).storyLanguage).toBe('5');
      expect(story).toEqual(before);
    }
    for (const frame of [
      { type: 'background', src: 'assets/scene.svg' },
      { type: 'image', src: 'assets/scene.svg', aspectRatio: 1, alt: 'Scene' },
      { type: 'narrative', text: 'Narrative' }, { type: 'dialogue', text: 'Dialogue' },
      { type: 'mask', content: { src: 'assets/scene.svg', alt: 'Masked scene' }, shape: { type: 'ellipse' }, position: { anchor: 'center', width: '50%', height: '50%' } },
    ]) {
      const story = cardStory();
      firstPanel(story).height = { mode: 'viewport' };
      firstPanel(story).frames = [{ ...frame, beat: { id: 'frame-moment' } }];
      expect(() => parseStory(story)).not.toThrow();
    }
  });
  it('requires globally unique IDs across Elements and timeline moments', () => {
    for (const id of ['lunora-entry', 'lunora-card', 'lunora-arrival', 'lunora-opening-art']) {
      const story = cardStory(); transition(story).beats[1].id = id;
      expect(() => parseStory(story)).toThrow(`Duplicate ID: ${id}`);
    }
  });
  it('accepts unsorted and coincident progress while rejecting malformed declarations', () => {
    const valid = cardStory(); transition(valid).beats.reverse();
    transition(valid).beats[1].progress = transition(valid).beats[0].progress;
    expect(() => parseStory(valid)).not.toThrow();
    for (const beats of [[], [{ id: 'a' }], [{ progress: .5 }], [{ id: 'a', progress: -1 }], [{ id: 'a', progress: 1.01 }], [{ id: 'a', progress: Infinity }], [{ id: 'a', progress: .5, align: 'center' }], [{ id: 'a', progress: '0.5' }]]) {
      const story = cardStory(); transition(story).beats = beats;
      expect(() => parseStory(story)).toThrow(StoryValidationError);
    }
    for (const beat of [{}, { id: 'a', align: 'middle' }, { id: 'a', progress: .5 }, ...['5%', 'calc(2px)', '5', 'NaNpx'].map(offset => ({ id: 'a', offset }))]) {
      const story = cardStory(); firstPanel(story).beat = beat;
      expect(() => parseStory(story)).toThrow(StoryValidationError);
    }
  });
  it('rejects Beats on unsupported owners', () => {
    for (const owner of ['body', 'container', 'space', 'reveal', 'panel-timeline']) {
      const story = cardStory();
      if (owner === 'body') story.body.beat = { id: 'invalid' };
      if (owner === 'container') story.body.containers[0].beat = { id: 'invalid' };
      if (owner === 'space') story.body.containers[0].flow[1].beat = { id: 'invalid' };
      if (owner === 'reveal') firstPanel(story).frames[0].scrollAnimation = { type: 'reveal', beats: [{ id: 'invalid', progress: .5 }] };
      if (owner === 'panel-timeline') firstPanel(story).beats = [{ id: 'invalid', progress: .5 }];
      expect(() => parseStory(story)).toThrow(StoryValidationError);
    }

  });
});

describe('Beat coordinate mathematics', () => {
  it('aligns matching element and viewport points then applies signed offsets', () => {
    expect(elementCoordinate(900, 400, 800)).toBe(900);
    expect(elementCoordinate(900, 400, 800, 'center')).toBe(700);
    expect(elementCoordinate(900, 400, 800, 'end', -80)).toBe(420);
    expect(elementCoordinate(100, 1200, 800, 'center', 40)).toBe(340);
  });
  it('maps full timeline progress to real coordinates', () => {
    expect(timelineCoordinate({ start: 200, end: 1200 }, 0)).toBe(200);
    expect(timelineCoordinate({ start: 200, end: 1200 }, .45)).toBe(650);
    expect(timelineCoordinate({ start: 200, end: 1200 }, 1)).toBe(1200);
  });
  it('clamps and sorts while retaining authored ties and input immutability', () => {
    const input = [{ id: 'late', scrollY: 900 }, { id: 'first', scrollY: -100 }, { id: 'tie', scrollY: 0 }, { id: 'middle', scrollY: 400 }];
    expect(orderBeats(input, 800)).toEqual([
      { id: 'first', scrollY: 0, order: 0 }, { id: 'tie', scrollY: 0, order: 1 },
      { id: 'middle', scrollY: 400, order: 2 }, { id: 'late', scrollY: 800, order: 3 },
    ]);
    expect(input[0].scrollY).toBe(900);
    expect(orderBeats(input, 0).map(b => b.id)).toEqual(input.map(b => b.id));
  });
  it('removes pin displacement before, within and after its range', () => {
    const range = { start: 100, end: 500 };
    expect(pinDisplacement(range, 0)).toBe(0);
    expect(pinDisplacement(range, 250)).toBe(150);
    expect(pinDisplacement(range, 700)).toBe(400);
  });
});

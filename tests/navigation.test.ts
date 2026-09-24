import { describe, expect, it } from 'vitest';
import { createBeatNavigation, findDestination, findNearestDestination, type Destination, type NavigationState } from '../src/interaction/navigation';
import { parseStory, StoryValidationError } from '../src/parser/parse';

const fixture = () => ({ version: '0.10', body: {
  id: '550e8400-e29b-41d4-a716-446655440000', title: 'Navigation',
  interaction: { advance: { enabled: true, mode: 'beats' } },
  containers: [{ type: 'container', id: 'container', flow: [{ type: 'panel', id: 'panel', beat: { id: 'moment' }, frames: [{ type: 'narrative', text: 'A moment.' }] }] }],
} });

describe('interaction declaration', () => {
  it('accepts opt-in, opt-out and omitted interaction without mutating authored input', () => {
    const story = fixture(); const before = structuredClone(story);
    expect(parseStory(story).body.interaction?.advance.enabled).toBe(true);
    expect(story).toEqual(before);
    story.body.interaction.advance.enabled = false;
    expect(parseStory(story).body.interaction?.advance.enabled).toBe(false);
    const omitted: any = fixture(); delete omitted.body.interaction;
    expect(parseStory(omitted).body.interaction).toBeUndefined();
  });
  it('rejects older versions, missing fields and unsupported inputs/motion', () => {
    for (const version of ['0.1', '0.8', '0.9']) expect(() => parseStory({ ...fixture(), version })).toThrow('version 0.10');
    for (const interaction of [
      {}, { advance: {} }, { advance: { enabled: true } }, { advance: { mode: 'beats' } },
      { advance: { enabled: 'yes', mode: 'beats' } }, { advance: { enabled: true, mode: 'pages' } },
      { advance: { enabled: true, mode: 'beats', inputs: ['flip'] } },
      { advance: { enabled: true, mode: 'beats', motion: { duration: 1 } } },
      { scroll: { enabled: false }, advance: { enabled: true, mode: 'beats' } },
    ]) expect(() => parseStory({ ...fixture(), body: { ...fixture().body, interaction } })).toThrow(StoryValidationError);
  });
  it('requires authored Beats only when navigation is enabled', () => {
    const story: any = fixture(); delete story.body.containers[0].flow[0].beat;
    expect(() => parseStory(story)).toThrow('at least one authored Beat');
    story.body.interaction.advance.enabled = false;
    expect(() => parseStory(story)).not.toThrow();
  });
});

describe('semantic navigation', () => {
  const moments = [{ id: 'a', scrollY: 0 }, { id: 'b', scrollY: 100 }, { id: 'coincident', scrollY: 101 }, { id: 'c', scrollY: 200 }];
  it('selects the nearest distinct coordinate from manual scroll position without wrapping', () => {
    expect(findDestination(moments, 0, 'advance')?.id).toBe('b');
    expect(findDestination(moments, 100.5, 'advance')?.id).toBe('c');
    expect(findDestination(moments, 100.5, 'reverse')?.id).toBe('a');
    expect(findDestination(moments, 150, 'reverse')?.id).toBe('coincident');
    expect(findDestination(moments, 0, 'reverse')).toBeUndefined();
    expect(findDestination(moments, 200, 'advance')).toBeUndefined();
    expect(findDestination([], 20, 'advance')).toBeUndefined();
  });
  function setup() {
    let y = 0;
    let beats: readonly Destination[] = moments;
    const requests: Array<{ destination: () => number | undefined; complete: () => void; cancelled: boolean }> = [];
    const states: NavigationState[] = [];
    const controller = createBeatNavigation({
      readScrollY: () => y, readBeats: () => beats,
      driver: { move(destination, complete) {
        const request = { destination, complete, cancelled: false }; requests.push(request);
        return () => { request.cancelled = true; };
      } },
    });
    controller.subscribe(state => states.push(state));
    return { controller, requests, states, scroll: (value: number) => { y = value; }, layout: (value: readonly Destination[]) => { beats = value; controller.update(); } };
  }
  it('snaps to the nearest Beat with stable ties and tracks its ID without looping', () => {
    const { controller, requests, scroll, layout } = setup();
    expect(findNearestDestination(moments, 50)?.id).toBe('a');
    expect(findNearestDestination([], 10)).toBeUndefined();
    scroll(155); controller.snap();
    expect(requests[0].destination()).toBe(200);
    controller.snap(); expect(requests).toHaveLength(1);
    layout([{ id: 'c', scrollY: 220 }]);
    expect(requests[0].destination()).toBe(220);
    requests[0].complete(); scroll(219); controller.snap();
    expect(requests).toHaveLength(1);
  });
  it('ignores repeated same-direction requests and reverses from the current position', () => {
    const { controller, requests, scroll } = setup();
    controller.advance(); controller.advance();
    expect(requests).toHaveLength(1); expect(requests[0].destination()).toBe(100);
    scroll(40); controller.reverse();
    expect(requests[0].cancelled).toBe(true);
    expect(requests[1].destination()).toBe(0);
  });
  it('tracks the selected Beat ID through layout updates and cancels if it disappears', () => {
    const { controller, requests, layout, states } = setup();
    controller.advance();
    layout([{ id: 'a', scrollY: 0 }, { id: 'new', scrollY: 50 }, { id: 'b', scrollY: 170 }]);
    expect(requests[0].destination()).toBe(170);
    layout([{ id: 'a', scrollY: 0 }]);
    expect(requests[0].cancelled).toBe(true);
    expect(states.at(-1)?.moving).toBe(false);
  });
  it('yields to interruption, recomputes from manual scroll, and stops after destroy', () => {
    const { controller, requests, scroll, states } = setup();
    controller.advance(); controller.cancel();
    expect(requests[0].cancelled).toBe(true);
    scroll(150); controller.advance(); expect(requests[1].destination()).toBe(200);
    controller.destroy(); const count = states.length;
    requests[1].complete(); controller.advance(); controller.update();
    expect(states).toHaveLength(count); expect(requests).toHaveLength(2);
  });
  it('supports a synchronously completing driver and updates boundary availability', () => {
    let y = 0;
    const states: NavigationState[] = [];
    const controller = createBeatNavigation({ readScrollY: () => y, readBeats: () => moments,
      driver: { move(destination, complete) { y = destination()!; complete(); return () => {}; } } });
    controller.subscribe(state => states.push(state));
    controller.advance(); controller.advance();
    expect(y).toBe(200);
    expect(states.at(-1)).toMatchObject({ canAdvance: false, canReverse: true, moving: false });
  });
});

it('validates versioned input selection and keeps controls available', () => {
  const story = { ...fixture(), version: '0.11' };
  for (const inputs of [undefined, ['controls'], ['controls', 'keyboard'], ['keyboard', 'controls']]) {
    const advance = { ...story.body.interaction.advance, ...(inputs ? { inputs } : {}) };
    expect(parseStory({ ...story, body: { ...story.body, interaction: { advance } } }).version).toBe('0.11');
  }
  for (const inputs of [[], ['keyboard'], ['flip', 'controls'], ['controls', 'controls']]) {
    const advance = { ...story.body.interaction.advance, inputs };
    expect(() => parseStory({ ...story, body: { ...story.body, interaction: { advance } } })).toThrow(StoryValidationError);
  }
  expect(() => parseStory({ ...fixture(), body: { ...story.body, interaction: { advance: { ...story.body.interaction.advance, inputs: ['controls'] } } } })).toThrow('version 0.11');
});


it('validates opt-in settled scrolling and rejects competing gesture ownership', () => {
  const document = { ...fixture(), version: '0.13' };
  for (const snap of ['none', 'beats']) {
    expect(parseStory({ ...document, body: { ...document.body, interaction: { ...document.body.interaction, scroll: { snap } } } }).version).toBe('0.13');
  }
  const withSnap = { ...document, body: { ...document.body, interaction: { ...document.body.interaction, scroll: { snap: 'beats' } } } };
  expect(() => parseStory({ ...withSnap, version: '0.12' })).toThrow('version 0.13');
  withSnap.body.interaction.advance.enabled = false;
  expect(() => parseStory(withSnap)).toThrow('requires enabled Beat navigation');
  withSnap.body.interaction.advance.enabled = true;
  expect(() => parseStory({ ...withSnap, body: { ...withSnap.body, interaction: { ...withSnap.body.interaction, advance: { ...withSnap.body.interaction.advance, inputs: ['controls', 'flip'] } } } })).toThrow('cannot be combined');
});

it('accepts tap only in the versioned input contract', () => {
  const story = { ...fixture(), version: '0.14', body: { ...fixture().body,
    interaction: { advance: { enabled: true, mode: 'beats', inputs: ['controls', 'keyboard', 'tap'] }, scroll: { snap: 'none' } },
  } };
  expect(parseStory(story).body.interaction?.advance.inputs).toContain('tap');
  expect(() => parseStory({ ...story, version: '0.13' })).toThrow('Tap input requires document version 0.14');
});

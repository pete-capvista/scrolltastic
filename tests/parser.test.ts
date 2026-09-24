import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseStory, StoryValidationError } from '../src/parser/parse';
import { resolveAsset } from '../src/assets/resolve';

function minimal() {
  return { version: '0.1', body: { id: '550e8400-e29b-41d4-a716-446655440000', title: 'Example', containers: [{ type: 'container', id: 'c1', flow: [{ type: 'panel', id: 'p1', frames: [{ type: 'narrative', text: 'Hello' }] }] }] } };
}
function issues(document: unknown) {
  try { parseStory(document); throw new Error('Expected validation failure'); }
  catch (error) { expect(error).toBeInstanceOf(StoryValidationError); return (error as StoryValidationError).diagnostics; }
}
describe('document contract', () => {
  it('normalizes without mutating authored input', () => {
    const input = minimal();
    const before = structuredClone(input);
    const output = parseStory(input);
    expect(input).toEqual(before);
    const panel = output.body.containers[0].flow[0];
    expect(panel.type).toBe('panel');
    if (panel.type === 'panel') {
      expect(panel.height.mode).toBe('auto');
      expect(panel.frames[0].flow).toBe('normal');
    }
  });
  it('validates every committed story and its asset references', () => {
    for (const id of readdirSync('public/stories')) {
      const story = parseStory(readFileSync(`public/stories/${id}/story.json`, 'utf8'));
      expect(story.body.id).toBe(id);
      for (const container of story.body.containers) for (const item of container.flow) {
        if (item.type !== 'panel') continue;
        for (const frame of item.frames) if ('asset' in frame) expect(readFileSync(`public/stories/${id}/${frame.asset}`).length).toBeGreaterThan(0);
      }
    }
  });
  it('reports malformed JSON and duplicate IDs at document paths', () => {
    expect(issues('{broken')[0].path).toBe('/');
    const doc = minimal(); doc.body.containers[0].flow[0].id = 'c1';
    expect(issues(doc)).toContainEqual({ path: '/body/containers/0/flow/0/id', message: 'Duplicate ID: c1.' });
  });
  it('rejects unsupported declarations, versions and legacy panels', () => {
    expect(() => parseStory({ ...minimal(), version: '99' })).toThrow(StoryValidationError);
    const doc: any = minimal();
    doc.body.containers[0].panels = doc.body.containers[0].flow;
    delete doc.body.containers[0].flow;
    expect(issues(doc).some(i => i.message.includes('migrate'))).toBe(true);
    for (const type of ['card', 'mask', 'unknown']) {
      const input: any = minimal(); input.body.containers[0].flow[0].frames[0].type = type;
      expect(() => parseStory(input)).toThrow(StoryValidationError);
    }
    const bleed: any = minimal(); bleed.body.containers[0].flow[0].frames[0].bleed = { top: true };
    expect(() => parseStory(bleed)).toThrow(StoryValidationError);
  });
  it('requires height-producing content and positions for overflow', () => {
    const doc: any = minimal();
    doc.body.containers[0].flow[0].height = { mode: 'content' };
    doc.body.containers[0].flow[0].frames = [{ type: 'narrative', text: 'Caption', flow: 'overflow' }];
    const errors = issues(doc);
    expect(errors.some(i => i.path.endsWith('/position'))).toBe(true);
    expect(errors.some(i => i.path.endsWith('/height'))).toBe(true);
  });
  it('rejects background flow, missing ratio, nonfinite ratios and invalid lengths', () => {
    for (const frame of [
      { type: 'background', asset: 'assets/a.svg', flow: 'normal' },
      { type: 'image', asset: 'assets/a.svg', alt: 'A scene' },
      { type: 'image', asset: 'assets/a.svg', alt: 'A scene', aspectRatio: Infinity },
    ]) {
      const doc: any = minimal(); doc.body.containers[0].flow[0].frames = [frame];
      expect(() => parseStory(doc)).toThrow(StoryValidationError);
    }
    for (const value of ['-10px', '50%', 'calc(100vh)', 'garbage']) {
      const doc: any = minimal(); doc.body.containers[0].flow[0].height = { mode: 'fixed', value };
      expect(() => parseStory(doc)).toThrow(StoryValidationError);
    }
  });
  it('does not treat text as markup or strip it', () => {
    const doc = minimal(); doc.body.containers[0].flow[0].frames[0].text = '<script>alert(1)</script>';
    expect(JSON.stringify(parseStory(doc))).toContain('<script>');
  });
});
describe('package resolution', () => {
  const base = 'https://example.test/stories/one/releases/two/';
  it('resolves nested assets inside a supplied release', () => {
    expect(resolveAsset('assets/scene/detail.webp', base)).toBe(`${base}assets/scene/detail.webp`);
  });
  it.each(['../other/a.svg', 'assets/../a.svg', '/assets/a.svg', 'https://other.test/a.svg', 'assets/%2e%2e/a.svg', 'assets/a.svg?x=1', 'assets\\a.svg'])('rejects escaping or ambiguous reference %s', value => {
    expect(() => resolveAsset(value, base)).toThrow();
  });
  it.each(['file:///tmp/', 'https://example.test/package', 'https://example.test/package/?x=1'])('rejects invalid base %s', baseUrl => {
    expect(() => resolveAsset('assets/a.svg', baseUrl)).toThrow();
  });
});

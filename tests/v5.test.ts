import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseStory, validateStory } from '../src/parser/parse';
import { loadStoryRoot, packageUrl, resolveStory } from '../src/reader/resolve-story';

const id = '11111111-1111-4111-8111-111111111111';
const fixture = () => JSON.parse(readFileSync(`public/stories/${id}/story.json`, 'utf8'));
const image = (story: ReturnType<typeof fixture>) => story.body.containers[0].flow[0].frames[1];
describe('V5 language', () => {
  it('normalizes shorthand heights and preserves root semantics without mutation', () => {
    const story = fixture(); const before = structuredClone(story);
    const parsed = parseStory(story);
    expect(parsed).toMatchObject({ storyLanguage: '5', id, language: 'en', beats: [{ target: 'arrival', label: 'Arrival' }, ...story.beats.slice(1)] });
    expect(parsed.body.containers[0].flow[0]).toMatchObject({ height: { mode: 'content' } });
    expect(story).toEqual(before);
  });
  it('rejects old spellings rather than silently accepting incompatible documents', () => {
    for (const patch of [{ version: '0.14' }, { storyLanguage: '6' }, { body: { ...fixture().body, id } }]) {
      expect(() => parseStory({ ...fixture(), ...patch })).toThrow();
    }
    const story = fixture(); image(story).asset = image(story).src; delete image(story).src;
    expect(() => parseStory(story)).toThrow();
  });
  it('validates locales, typography and decorative intent', () => {
    for (const language of ['en-NZ', 'ja', 'zh-Hant', 'ar', 'he']) expect(() => parseStory({ ...fixture(), language })).not.toThrow();
    for (const patch of [{ language: 'bad_tag' }, { direction: 'sideways' }, { body: { ...fixture().body, typography: { font: 'url(evil)' } } }]) expect(() => parseStory({ ...fixture(), ...patch })).toThrow();
    const story = fixture(); image(story).decorative = true;
    expect(() => parseStory(story)).toThrow('Decorative media');
    delete image(story).alt;
    expect(validateStory(story).diagnostics).toEqual([]);
  });
  it('reports accessibility warnings without silently decorating meaningful media', () => {
    const story = fixture(); delete image(story).alt;
    const result = validateStory(story);
    expect(result.document).toBeDefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: 'warning', category: 'accessibility', code: 'missing-alt', path: '/body/containers/0/flow/0/frames/1/alt' }));
    story.metadata = { src: 'Non-rendering metadata', language: 'not a locale' };
    expect(validateStory(story).diagnostics).toHaveLength(1);
  });
  it('requires resolvable root Beat targets and globally unique Beat IDs', () => {
    const story = fixture(); story.beats[0].target = 'crossing';
    expect(() => parseStory(story)).toThrow('Beat target must identify a Panel or Frame');
    story.beats[0].target = 'arrival'; story.beats[0].id = 'arrival';
    expect(() => parseStory(story)).toThrow('Duplicate ID');
  });
  it('permits simple static Cards but requires deterministic extraction geometry', () => {
    const story = fixture(); const card = story.body.containers[0].flow[4].frames[0];
    expect(() => parseStory(story)).not.toThrow();
    card.artwork = { transition: { direction: 'out', presentation: 'fit' } };
    const result = validateStory(story);
    expect(result.document).toBeUndefined();
    expect(result.diagnostics.map(d => d.path)).toEqual(expect.arrayContaining([
      '/body/containers/0/flow/4/frames/0/cardGeometry', '/body/containers/0/flow/4/frames/0/aspectRatio',
    ]));
  });
  it('preserves multilingual text and produces nonfatal long-prose advice', () => {
    const story = fixture(); const frame = story.body.containers[0].flow[0].frames[0];
    frame.text = '物語はここから始まる。 مرحبًا 🌙 Café';
    expect(JSON.stringify(parseStory(story))).toContain(frame.text);
    frame.text = 'A word. '.repeat(80);
    expect(validateStory(story).diagnostics).toContainEqual(expect.objectContaining({ code: 'long-narrative', severity: 'warning' }));
  });
});
describe('portable reader resolution', () => {
  it('prefers the host-owned deployment root over the static fallback', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    await expect(loadStoryRoot(new AbortController().signal, 'https://blob.example.test/')).resolves.toBe('https://blob.example.test/');
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
  });
  it('resolves the same package under local and remote roots', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(fixture()), { headers: { 'content-type': 'application/json; charset=utf-8' } }));
    for (const root of ['/stories/', 'https://content.example.test/library/']) {
      const result = await resolveStory(id, root, 'https://reader.example.test/', new AbortController().signal, fetcher);
      expect(result.document.id).toBe(id);
      expect(result.assetBaseUrl).toBe(new URL(`${id}/`, new URL(root, 'https://reader.example.test/')).href);
    }
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'error', credentials: 'omit' }));
  });
  it('rejects unsafe roots, wrong package identities, HTTP errors and HTML fallback', async () => {
    for (const root of ['javascript:alert(1)', 'file:///tmp/', 'https://x.test/root', 'https://u:p@x.test/', 'https://x.test/?x=1']) expect(() => packageUrl(id, root, 'https://reader.test/')).toThrow();
    expect(() => packageUrl('../escape', '/stories/', 'https://reader.test/')).toThrow();
    for (const response of [new Response('Not found', { status: 404 }), new Response('<html/>', { headers: { 'content-type': 'text/html' } }), new Response(JSON.stringify({ ...fixture(), id: '22222222-2222-4222-8222-222222222222' }), { headers: { 'content-type': 'application/json' } })]) {
      await expect(resolveStory(id, '/stories/', 'https://reader.test/', new AbortController().signal, async () => response)).rejects.toThrow();
    }
  });
});

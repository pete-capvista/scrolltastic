import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { validateStory } from '../src/parser/parse';
import { resolveMappedAsset } from '../src/assets/resolve';
import { collectStoryAssetPaths, isStoryAssetPath } from '../extensions/vscode/src/package-path.js';
import archive from '../extensions/vscode/src/archive.js';
import downloader from '../extensions/vscode/src/downloader.js';

describe('VS Code story package assets', () => {
  it('accepts only package-relative media paths supported by Story Language V5', () => {
    for (const path of ['assets/scene.webp', 'cards/chapter_2/cover-1.svg', 'assets/scene.jpeg']) {
      expect(isStoryAssetPath(path)).toBe(true);
    }
    for (const path of ['../scene.svg', '/assets/scene.svg', 'assets/scene image.svg', 'assets/scene.SVG', 'assets/scene.gif', 'https://example.test/scene.svg']) {
      expect(isStoryAssetPath(path)).toBe(false);
    }
  });

  it('indexes unique authored src references without interpreting other story strings', () => {
    const story = {
      title: 'assets/ignored.svg',
      body: { containers: [{ flow: [{ frames: [
        { type: 'image', src: 'assets/scene.svg' },
        { type: 'mask', content: { src: 'assets/scene.svg' } },
        { type: 'card', src: 'cards/front.png' },
        { type: 'image', src: '../outside.svg' },
      ] }] }] },
    };
    expect(collectStoryAssetPaths(story)).toEqual(['assets/scene.svg', 'cards/front.png']);
    expect(collectStoryAssetPaths('assets/nope.svg')).toEqual([]);
  });

  it('resolves only an explicit safe package asset map entry', () => {
    const assets = { 'assets/scene.svg': 'vscode-webview-resource://story/scene.svg?revision=2' };
    expect(resolveMappedAsset('assets/scene.svg', assets)).toContain('revision=2');
    expect(() => resolveMappedAsset('../outside.svg', assets)).toThrow('Invalid package asset');
    expect(() => resolveMappedAsset('cards/missing.webp', assets)).toThrow('unavailable');
  });
});

describe('VS Code live story download', () => {
  it('accepts a story UUID or published reader URL', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(downloader.storyIdFromInput(id)).toBe(id);
    expect(downloader.storyIdFromInput(`https://scrolltastic.vercel.app/s/${id}`)).toBe(id);
    expect(() => downloader.storyIdFromInput('../story')).toThrow('V5 story UUID');
  });

  it('ignores workspace overrides for the trusted live story root', () => {
    const vscode = {
      workspace: { getConfiguration: () => ({ inspect: () => ({ globalValue: undefined, workspaceValue: 'https://evil.example/', defaultValue: 'https://scrolltastic.vercel.app/stories/' }) }) },
    };
    expect(downloader.downloadStoryRoot(vscode)).toBe('https://scrolltastic.vercel.app/stories/');
    expect(() => downloader.downloadStoryRoot({
      workspace: { getConfiguration: () => ({ inspect: () => ({ globalValue: 'http://example.test/stories/' }) }) },
    })).toThrow('HTTPS directory URL');
  });

  it('creates a readable deflated ZIP entry for an archived folder', () => {
    const zip = archive.createZip([{ path: 'story.json', bytes: Buffer.from('{"title":"old"}'), mtime: new Date('2026-01-02T03:04:06') }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const nameLength = zip.readUInt16LE(26);
    const compressedLength = zip.readUInt32LE(18);
    const compressed = zip.subarray(30 + nameLength, 30 + nameLength + compressedLength);
    expect(inflateRawSync(compressed).toString()).toBe('{"title":"old"}');
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  });
});

describe('generated validator compatibility', () => {
  it('uses static browser-safe validation code rather than runtime compilation', () => {
    const validator = readFileSync(new URL('../src/parser/story-validator.generated.js', import.meta.url), 'utf8');
    expect(validator).not.toMatch(/\brequire\s*\(/);
    expect(validator).not.toMatch(/\beval\s*\(/);
  });

  it.each([
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '550e8400-e29b-41d4-a716-446655440000',
    'c6c6bfa1-145e-4d68-a2fd-cc94107b46ea',
  ])('validates the V5 fixture %s', id => {
    const source = readFileSync(new URL(`../public/stories/${id}/story.json`, import.meta.url), 'utf8');
    expect(validateStory(source).document).toBeDefined();
  });
});

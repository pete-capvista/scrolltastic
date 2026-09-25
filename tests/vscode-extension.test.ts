import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateStory } from '../src/parser/parse';
import { resolveMappedAsset } from '../src/assets/resolve';
import { collectStoryAssetPaths, isStoryAssetPath } from '../extensions/vscode/src/package-path.js';

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

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentTypeForPath, manifestHash, requirePublisher, signClaims, validateManifest, validatePublishedStory, verifyClaims, type PublishClaims } from '../server-api/publish/_shared';

const require = createRequire(import.meta.url);
const publisher = require('../extensions/vscode/src/publisher.js') as {
  manifestEntry(path: string, bytes: Buffer): { path: string; size: number; sha256: string; contentType: string };
  publishingApiBase(vscode: unknown): string;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('publishing package contract', () => {
  it('builds deterministic content metadata accepted by the server', () => {
    const story = Buffer.from('{"storyLanguage":"5"}');
    const image = Buffer.from('<svg/>');
    const manifest = [publisher.manifestEntry('story.json', story), publisher.manifestEntry('assets/scene.svg', image)];
    expect(validateManifest(manifest)).toEqual([...manifest].sort((a, b) => a.path.localeCompare(b.path)));
    expect(manifest[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(contentTypeForPath('cards/front.webp')).toBe('image/webp');
  });

  it('rejects unsafe, duplicate, oversized and incomplete manifests', () => {
    const entry = publisher.manifestEntry('story.json', Buffer.from('{}'));
    for (const manifest of [
      [{ ...entry, path: '../story.json' }],
      [entry, entry],
      [{ ...entry, size: 26 * 1024 * 1024 }],
      [publisher.manifestEntry('assets/a.svg', Buffer.from('<svg/>'))],
    ]) expect(() => validateManifest(manifest)).toThrow();
  });

  it('validates the canonical story and requires every authored asset', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const bytes = Buffer.from(readFileSync(`public/stories/${id}/story.json`, 'utf8'));
    const story = publisher.manifestEntry('story.json', bytes);
    expect(() => validatePublishedStory(bytes, id, [
      story,
      publisher.manifestEntry('assets/lantern.svg', Buffer.from('<svg/>')),
      publisher.manifestEntry('cards/lantern.svg', Buffer.from('<svg/>')),
    ])).not.toThrow();
    expect(() => validatePublishedStory(bytes, id, [story])).toThrow('Referenced asset');
  });

  it('binds an expiring signed authorization to the exact prepared manifest', () => {
    const files = validateManifest([publisher.manifestEntry('story.json', Buffer.from('{}'))]);
    const claims: PublishClaims = {
      kind: 'publish', publisher: 'author', publishId: '11111111-1111-4111-8111-111111111111',
      storyId: '22222222-2222-4222-8222-222222222222', manifestHash: manifestHash(files),
      baseRevision: null, expiresAt: Date.now() + 60_000,
    };
    const token = signClaims(claims, 'a-secure-test-secret-that-is-long-enough');
    expect(verifyClaims<PublishClaims>(token, 'publish', 'a-secure-test-secret-that-is-long-enough')).toEqual(claims);
    const [payload, signature] = token.split('.');
    const tampered = `${payload}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
    expect(() => verifyClaims(tampered, 'publish', 'a-secure-test-secret-that-is-long-enough')).toThrow('invalid');
    expect(manifestHash(files)).not.toBe(manifestHash([{ ...files[0], sha256: '0'.repeat(64) }]));
  });

  it('rejects expired publish authorizations', () => {
    const claims: PublishClaims = {
      kind: 'publish', publisher: 'author', publishId: '11111111-1111-4111-8111-111111111111',
      storyId: '22222222-2222-4222-8222-222222222222', manifestHash: '0'.repeat(64),
      baseRevision: null, expiresAt: Date.now() - 1,
    };
    const secret = 'a-secure-test-secret-that-is-long-enough';
    expect(() => verifyClaims(signClaims(claims, secret), 'publish', secret)).toThrow('expired');
  });

  it('routes legacy GitHub publishing through the shared story policy without granting edit access', async () => {
    vi.stubEnv('SCROLLTASTIC_PUBLISHERS', 'author');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ login: 'Author' })));
    const request = new Request('https://scrolltastic.test/api/publish/prepare', { headers: { authorization: 'Bearer github-token' } });
    await expect(requirePublisher(request, '22222222-2222-4222-8222-222222222222')).resolves.toMatchObject({ publisher: 'author' });
    vi.stubEnv('SCROLLTASTIC_PUBLISHERS', 'someone-else');
    await expect(requirePublisher(request, '22222222-2222-4222-8222-222222222222')).rejects.toThrow('not authorized');
  });

  it('takes the publishing origin only from user settings and requires HTTPS', () => {
    const vscode = (globalValue: unknown, defaultValue = 'https://scrolltastic.vercel.app') => ({
      workspace: { getConfiguration: () => ({ inspect: () => ({ globalValue, workspaceValue: 'https://evil.example', defaultValue }) }) },
    });
    expect(publisher.publishingApiBase(vscode(undefined))).toBe('https://scrolltastic.vercel.app');
    expect(publisher.publishingApiBase(vscode('https://preview.example'))).toBe('https://preview.example');
    expect(() => publisher.publishingApiBase(vscode('http://preview.example'))).toThrow('HTTPS origin');
    expect(() => publisher.publishingApiBase(vscode('https://example.test/api'))).toThrow('HTTPS origin');
  });
});

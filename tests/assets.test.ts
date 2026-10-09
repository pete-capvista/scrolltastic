import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  AssetInspectionError, inspectDraftAsset, MAX_DRAFT_ASSET_BYTES, parseDraftAssetType, prepareAssetIdentity,
} from '../src/authoring/assets';
import { generateDraftImage } from '../src/authoring/asset-service';

afterEach(() => vi.unstubAllEnvs());

describe('secure draft asset inspection', () => {
  it('normalizes raster bytes, verifies their magic format, and records dimensions', async () => {
    const source = await sharp({ create: { width: 3, height: 2, channels: 4, background: '#336699' } })
      .withMetadata({ orientation: 6 }).png().toBuffer();
    const inspected = await inspectDraftAsset(source, 'image/png');
    expect(inspected.width).toBe(2);
    expect(inspected.height).toBe(3);
    expect(inspected.digest).toMatch(/^[0-9a-f]{64}$/);
    expect((await sharp(inspected.bytes).metadata()).orientation).toBeUndefined();
    await expect(inspectDraftAsset(source, 'image/jpeg')).rejects.toMatchObject({ code: 'invalid_asset' });
  });

  it('accepts inert SVG and rejects active, external, and entity-bearing SVG', async () => {
    const safe = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10"/></svg>');
    await expect(inspectDraftAsset(safe, 'image/svg+xml')).resolves.toMatchObject({ width: 20, height: 10 });
    for (const source of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.test/a.png"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///etc/passwd"/></svg>',
      '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)"/></svg>',
    ]) await expect(inspectDraftAsset(new TextEncoder().encode(source), 'image/svg+xml')).rejects.toBeInstanceOf(AssetInspectionError);
  });

  it('rejects corrupt and oversized input before approval', async () => {
    await expect(inspectDraftAsset(new Uint8Array([1, 2, 3]), 'image/png')).rejects.toBeInstanceOf(Error);
    await expect(inspectDraftAsset(new Uint8Array(MAX_DRAFT_ASSET_BYTES + 1), 'image/png')).rejects.toMatchObject({ code: 'asset_too_large' });
  });

  it('creates collision-resistant workspace-bound quarantine paths and rejects unknown MIME types', () => {
    const identity = prepareAssetIdentity('workspace', 'image/webp', 'cards');
    expect(identity.logicalPath).toMatch(/^cards\/[0-9a-f-]+\.webp$/);
    expect(identity.quarantineKey).toBe(`_drafts/workspace/quarantine/${identity.id}.webp`);
    expect(() => parseDraftAssetType('text/html')).toThrow('Supported upload types');
  });

  it('rejects image generation before database or provider work when draft storage is unavailable', async () => {
    vi.stubEnv('DRAFT_BLOB_READ_WRITE_TOKEN', '');

    await expect(generateDraftImage('generation', {
      prompt: 'Moonlight over a quiet landscape',
      aspect: 'landscape',
    })).rejects.toMatchObject({ code: 'storage_unavailable' });
  });
});

import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

export const DRAFT_ASSET_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/svg+xml'] as const;
export type DraftAssetType = typeof DRAFT_ASSET_TYPES[number];
export const MAX_DRAFT_ASSET_BYTES = 25 * 1024 * 1024;
export const MAX_DRAFT_ASSET_DIMENSION = 16_384;
export const MAX_DRAFT_ASSET_PIXELS = 80_000_000;

const extensionByType: Record<DraftAssetType, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg',
};

export class AssetInspectionError extends Error {
  constructor(public code: 'invalid_asset' | 'asset_too_large' | 'unsafe_svg', message: string) { super(message); }
}

export interface DraftAssetInspection {
  bytes: Uint8Array;
  digest: string;
  mediaType: DraftAssetType;
  width: number;
  height: number;
}

export function prepareAssetIdentity(workspaceId: string, mediaType: DraftAssetType, area: 'assets' | 'cards' = 'assets') {
  const id = randomUUID();
  const logicalPath = `${area}/${id}.${extensionByType[mediaType]}`;
  return { id, logicalPath, quarantineKey: `_drafts/${workspaceId}/quarantine/${id}.${extensionByType[mediaType]}` };
}

export function parseDraftAssetType(value: unknown): DraftAssetType {
  if (typeof value !== 'string' || !DRAFT_ASSET_TYPES.includes(value as DraftAssetType)) {
    throw new AssetInspectionError('invalid_asset', 'Supported upload types are PNG, JPEG, WebP, AVIF, and SVG.');
  }
  return value as DraftAssetType;
}

function assertDimensions(width: number | undefined, height: number | undefined): asserts width is number {
  if (!width || !height || width > MAX_DRAFT_ASSET_DIMENSION || height > MAX_DRAFT_ASSET_DIMENSION || width * height > MAX_DRAFT_ASSET_PIXELS) {
    throw new AssetInspectionError('invalid_asset', 'The image dimensions are missing or exceed the configured limit.');
  }
}

function assertSafeSvg(source: string): void {
  if (!/^\s*<svg[\s>]/i.test(source)
    || /<!DOCTYPE|<!ENTITY|<script|<foreignObject|<iframe|<object|<embed|<style|<animate|<set\b/i.test(source)
    || /\son[a-z]+\s*=|\b(?:href|xlink:href)\s*=\s*["']\s*(?!#)[^"']/i.test(source)
    || /url\s*\(\s*["']?\s*(?:https?:|data:|javascript:|\/\/)/i.test(source)) {
    throw new AssetInspectionError('unsafe_svg', 'The SVG contains active or externally referenced content.');
  }
}

export async function inspectDraftAsset(input: Uint8Array, declaredType: DraftAssetType): Promise<DraftAssetInspection> {
  if (input.byteLength < 1 || input.byteLength > MAX_DRAFT_ASSET_BYTES) {
    throw new AssetInspectionError('asset_too_large', 'The upload is empty or exceeds 25 MiB.');
  }
  if (declaredType === 'image/svg+xml') assertSafeSvg(new TextDecoder().decode(input));
  let image = sharp(input, { failOn: 'error', limitInputPixels: MAX_DRAFT_ASSET_PIXELS });
  const metadata = await image.metadata();
  const actualType = metadata.format === 'jpeg' ? 'image/jpeg'
    : metadata.format === 'svg' ? 'image/svg+xml'
    : metadata.format ? `image/${metadata.format}` : undefined;
  if (actualType !== declaredType) throw new AssetInspectionError('invalid_asset', 'The image bytes do not match the declared media type.');
  assertDimensions(metadata.width, metadata.height);

  let normalized: Buffer;
  if (declaredType === 'image/svg+xml') normalized = Buffer.from(input);
  else {
    image = image.rotate();
    normalized = declaredType === 'image/png' ? await image.png().toBuffer()
      : declaredType === 'image/jpeg' ? await image.jpeg().toBuffer()
      : declaredType === 'image/webp' ? await image.webp().toBuffer()
      : await image.avif().toBuffer();
  }
  if (normalized.byteLength > MAX_DRAFT_ASSET_BYTES) throw new AssetInspectionError('asset_too_large', 'The normalized image exceeds 25 MiB.');
  return {
    bytes: normalized, digest: createHash('sha256').update(normalized).digest('hex'), mediaType: declaredType,
    width: metadata.autoOrient.width, height: metadata.autoOrient.height,
  };
}

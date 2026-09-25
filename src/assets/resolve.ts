const assetPath = /^(?:assets|cards)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:svg|png|jpg|jpeg|webp|avif)$/;

export type AssetResolver = (asset: string) => string;

export function resolveAsset(asset: string, baseUrl: string): string {
  if (!assetPath.test(asset)) throw new Error(`Invalid package asset: ${asset}`);
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || !base.pathname.endsWith('/') || base.search || base.hash) {
    throw new Error('assetBaseUrl must be an HTTP(S) package URL ending in /, without a query or fragment.');
  }
  const resolved = new URL(asset, base);
  if (resolved.origin !== base.origin || !resolved.pathname.startsWith(base.pathname)) {
    throw new Error('Asset escapes its story package.');
  }
  return resolved.href;
}

/** Resolve a package reference through a trusted host supplied asset map. */
export function resolveMappedAsset(asset: string, assets: Readonly<Record<string, string>>): string {
  if (!assetPath.test(asset)) throw new Error(`Invalid package asset: ${asset}`);
  const resolved = assets[asset];
  if (typeof resolved !== 'string' || !resolved) throw new Error(`Package asset is unavailable: ${asset}`);
  return resolved;
}

const assetPath = /^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:svg|png|jpg|jpeg|webp|avif)$/;

export function resolveAsset(asset: string, baseUrl: string): string {
  if (!assetPath.test(asset)) throw new Error(`Invalid package asset: ${asset}`);
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || !base.pathname.endsWith('/') || base.search || base.hash) {
    throw new Error('assetBaseUrl must be an HTTP(S) package URL ending in /, without a query or fragment.');
  }
  const resolved = new URL(asset, base);
  if (resolved.origin !== base.origin || !resolved.pathname.startsWith(base.pathname)) {
    throw new Error('Asset escapes its story package.');
  }
  return resolved.href;
}

const ASSET_PATH = /^(?:assets|cards)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:svg|png|jpg|jpeg|webp|avif)$/;

export function isStoryAssetPath(value) {
  return typeof value === 'string' && ASSET_PATH.test(value);
}

export function collectStoryAssetPaths(value) {
  const paths = new Set();
  const visit = node => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
    } else if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (key === 'src' && isStoryAssetPath(child)) paths.add(child);
        else visit(child);
      }
    }
  };
  visit(value);
  return [...paths];
}

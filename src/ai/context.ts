import { createHash } from 'node:crypto';
import type { NormalizedStory } from '../model/normalized.js';
import type { SuppliedMemory } from '../memory/model.js';

export interface ContextAsset {
  id: string; logicalPath: string; mediaType: string; width: number; height: number; digest: string;
}

export interface OutlineEntry { id: string; type: string; parentId?: string }

export interface AuthoringContext {
  revisionId: string;
  storyId: string;
  title: string;
  outline: OutlineEntry[];
  selectedId?: string;
  selected?: unknown;
  neighbourhood?: unknown;
  selectedAssetIds: string[];
  selectedAssets: ContextAsset[];
  document?: NormalizedStory;
  documentOmitted: boolean;
  assets: ContextAsset[];
  memory: SuppliedMemory[];
}

const MAX_CONTEXT_DOCUMENT_CHARS = 60_000;

function childrenOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(child => Array.isArray(child) ? child : child && typeof child === 'object' ? [child] : []);
}

export function findAuthoredElement(root: unknown, id: string): unknown | undefined {
  if (!root || typeof root !== 'object') return undefined;
  if (!Array.isArray(root) && (root as { id?: unknown }).id === id) return root;
  for (const child of childrenOf(root)) {
    const found = findAuthoredElement(child, id);
    if (found) return found;
  }
  return undefined;
}

export function authoredNeighbourhood(root: unknown, id: string): unknown | undefined {
  if (!root || typeof root !== 'object') return undefined;
  for (const [key, child] of Object.entries(root)) {
    if (!Array.isArray(child)) continue;
    const index = child.findIndex(item => item && typeof item === 'object' && (item as { id?: unknown }).id === id);
    if (index >= 0) return {
      parentId: (root as { id?: unknown }).id, collection: key, index,
      previous: index > 0 ? child[index - 1] : undefined,
      current: child[index], next: index + 1 < child.length ? child[index + 1] : undefined,
    };
    for (const item of child) {
      const nested = authoredNeighbourhood(item, id);
      if (nested) return nested;
    }
  }
  for (const child of childrenOf(root)) {
    const nested = authoredNeighbourhood(child, id);
    if (nested) return nested;
  }
  return undefined;
}

export function storyOutline(story: NormalizedStory): OutlineEntry[] {
  const result: OutlineEntry[] = [];
  const visit = (value: unknown, parentId?: string) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(item => visit(item, parentId)); return; }
    const record = value as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : undefined;
    const type = typeof record.type === 'string' ? record.type : undefined;
    if (id && type) result.push({ id, type, parentId });
    for (const child of Object.values(record)) if (child && typeof child === 'object') visit(child, id ?? parentId);
  };
  visit(story.body);
  return result;
}

export function buildAuthoringContext(
  story: NormalizedStory,
  revisionId: string,
  assets: ContextAsset[],
  selectedId?: string,
  memory: SuppliedMemory[] = [],
  selectedAssetIds: string[] = [],
): AuthoringContext {
  const serialized = JSON.stringify(story);
  const selectedAssetIdSet = new Set(selectedAssetIds);
  return {
    revisionId, storyId: story.id, title: story.title, outline: storyOutline(story), selectedId,
    selected: selectedId ? findAuthoredElement(story, selectedId) : undefined,
    neighbourhood: selectedId ? authoredNeighbourhood(story, selectedId) : undefined,
    selectedAssetIds: selectedAssetIds.filter(id => assets.some(asset => asset.id === id)),
    selectedAssets: assets.filter(asset => selectedAssetIdSet.has(asset.id)),
    document: serialized.length <= MAX_CONTEXT_DOCUMENT_CHARS ? story : undefined,
    documentOmitted: serialized.length > MAX_CONTEXT_DOCUMENT_CHARS,
    assets: assets.slice(0, 128), memory,
  };
}

export function contextDigest(context: AuthoringContext): string {
  return createHash('sha256').update(JSON.stringify(context)).digest('hex');
}

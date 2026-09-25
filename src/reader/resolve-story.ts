import { validateStory, StoryValidationError, type ValidationDiagnostic } from '../parser/parse';
import type { NormalizedStory } from '../model/normalized';

export const storyIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function packageUrl(id: string, storyRoot: string, hostUrl: string): string {
  if (!storyIdPattern.test(id)) throw new Error('Invalid story identifier.');
  const root = new URL(storyRoot, hostUrl);
  if (!['http:', 'https:'].includes(root.protocol) || root.username || root.password || root.search || root.hash || !root.pathname.endsWith('/')) {
    throw new Error('Story root must be an HTTP(S) directory URL without credentials, query or fragment.');
  }
  return new URL(`${id}/`, root).href;
}
export interface ResolvedStory {
  document: NormalizedStory;
  assetBaseUrl: string;
  diagnostics: ValidationDiagnostic[];
}
export async function resolveStory(id: string, storyRoot: string, hostUrl: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ResolvedStory> {
  const assetBaseUrl = packageUrl(id, storyRoot, hostUrl);
  const documentUrl = new URL('story.json', assetBaseUrl).href;
  const response = await fetcher(documentUrl, { signal, credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new Error(response.status === 404
    ? 'This story is unavailable. Check the link and try again.'
    : 'The story could not be loaded. Please try again.');
  if (!/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    throw new Error('The story endpoint did not return JSON.');
  }
  const result = validateStory(await response.text());
  if (!result.document) throw new StoryValidationError(result.diagnostics);
  if (result.document.id !== id) throw new Error('The story package does not match this link.');
  return { document: result.document, assetBaseUrl, diagnostics: result.diagnostics };
}

/** Host-owned runtime configuration; never read from an authored story. */
export async function loadStoryRoot(signal: AbortSignal, configuredRoot = import.meta.env.VITE_STORY_ROOT): Promise<string> {
  if (configuredRoot?.trim()) return configuredRoot;
  const response = await fetch('/reader-config.json', { signal, cache: 'no-cache', credentials: 'same-origin', redirect: 'error' });
  if (response.status === 404) return '/stories/';
  if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error('Reader configuration is unavailable.');
  const config: unknown = await response.json();
  if (!config || typeof config !== 'object' || !('storyRoot' in config) || typeof config.storyRoot !== 'string') throw new Error('Reader configuration requires a storyRoot URL.');
  return config.storyRoot;
}

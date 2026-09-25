import { mountStory, type StoryHandle } from '../renderer/mount';
import { StoryValidationError } from '../parser/parse';
import { loadStoryRoot, resolveStory, storyIdPattern } from './resolve-story';
import { renderLanding } from './landing';
import type { ControlsHandle } from '../inputs/controls';
import './reader.css';

const root = document.querySelector<HTMLElement>('#app')!;
let current: StoryHandle | undefined;
let animations: { destroy(): void } | undefined;
let controls: ControlsHandle | undefined;
let request: AbortController | undefined;
let revision = 0;

function message(title: string, description: string) {
  const box = document.createElement('div');
  box.className = 'reader-message';
  const brand = document.createElement('p');
  brand.className = 'reader-brand';
  brand.textContent = 'SCROLLTASTIC';
  const heading = document.createElement('h1');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = description;
  box.append(brand, heading, text);
  root.replaceChildren(box);
}

async function readRoute() {
  const run = ++revision;
  request?.abort();
  controls?.destroy();
  controls = undefined;
  animations?.destroy();
  animations = undefined;
  current?.destroy();
  current = undefined;
  request = new AbortController();
  document.title = 'Scrolltastic';
  root.removeAttribute('aria-busy');
  delete root.dataset.ready;
  const path = location.pathname;
  root.classList.toggle('landing-host', path === '/');
  if (path === '/') {
    renderLanding(root);
    return;
  }
  const match = /^\/s\/([^/]+)\/?$/.exec(path);
  if (!match || !storyIdPattern.test(match[1])) {
    message('Story not found', 'Check the story link and try again.');
    return;
  }
  const id = match[1];
  message('Opening your story…', 'One moment.');
  root.setAttribute('aria-busy', 'true');
  try {
    const storyRoot = await loadStoryRoot(request.signal);
    if (run !== revision) return;
    const { document, assetBaseUrl, diagnostics } = await resolveStory(id, storyRoot, location.origin, request.signal);
    if (run !== revision) return;
    if (import.meta.env.DEV && diagnostics.length) console.warn('Scrolltastic story diagnostics', diagnostics);
    current = mountStory(root, document, { assetBaseUrl, viewportBottomInset: () => controls?.height ?? 0 });
    await current.ready;
    if (run !== revision) return;
    if (current.animations.length) {
      const { attachStoryAnimations } = await import('../animation/reveals');
      if (run !== revision) return;
      animations = attachStoryAnimations(current.elements.get(document.id)!, current.animations);
    }
    if (document.body.interaction?.advance.enabled) {
      const { attachBeatControls } = await import('../inputs/controls');
      if (run !== revision) return;
      controls = attachBeatControls(root, current, document.body.interaction.advance.inputs?.includes('keyboard'), document.body.interaction.advance.inputs?.includes('flip'), document.body.interaction.scroll?.snap === 'beats', document.body.interaction.advance.inputs?.includes('tap'));
      current.refreshBeats();
    }
    window.document.title = `${document.title} · Scrolltastic`;
    root.dataset.ready = 'true';
  } catch (error) {
    if (run !== revision || (error instanceof DOMException && error.name === 'AbortError')) return;
    controls?.destroy();
    controls = undefined;
    animations?.destroy();
    animations = undefined;
    current?.destroy();
    current = undefined;
    message('Story unavailable', error instanceof StoryValidationError
      ? 'This story has an invalid or unsupported configuration.'
      : error instanceof Error ? error.message : 'Please try opening the story again.');
    if (import.meta.env.DEV && error instanceof StoryValidationError) {
      const detail = document.createElement('pre');
      detail.className = 'reader-diagnostics';
      detail.textContent = error.message;
      root.append(detail);
    }
  } finally {
    if (run === revision) root.removeAttribute('aria-busy');
  }
}
window.addEventListener('popstate', readRoute);
void readRoute();
if (import.meta.hot) import.meta.hot.dispose(() => {
  revision++;
  request?.abort();
  controls?.destroy();
  controls = undefined;
  animations?.destroy();
  current?.destroy();
  window.removeEventListener('popstate', readRoute);
});

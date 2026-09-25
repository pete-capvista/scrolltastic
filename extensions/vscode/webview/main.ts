import { validateStory } from '../../../src/parser/parse';
import { mountStory, type StoryHandle } from '../../../src/renderer/mount';
import { attachStoryAnimations, type AnimationHandle } from '../../../src/animation/reveals';
import { attachBeatControls, type ControlsHandle } from '../../../src/inputs/controls';
import { resolveMappedAsset } from '../../../src/assets/resolve';
import { isStoryAssetPath } from '../src/package-path.js';
import '../../../src/reader/reader.css';
import './preview.css';

interface RenderMessage {
  type: 'render';
  revision: number;
  text: string;
  assets: Record<string, string>;
  missingAssets: string[];
  blockedAssets: string[];
  scrollY: number;
}

const vscode = acquireVsCodeApi();
const root = document.querySelector<HTMLElement>('#story-root')!;
let revision = 0;
let current: StoryHandle | undefined;
let animations: AnimationHandle | undefined;
let controls: ControlsHandle | undefined;
let currentStory: NonNullable<ReturnType<typeof validateStory>['document']> | undefined;
let scrollListener: (() => void) | undefined;
let positionTimer = 0;

function sendPosition() {
  window.clearTimeout(positionTimer);
  positionTimer = window.setTimeout(() => vscode.postMessage({ type: 'position', revision, scrollY: window.scrollY }), 80);
}

function attachStory(story: NonNullable<ReturnType<typeof validateStory>['document']>, handle: StoryHandle) {
  currentStory = story;
  current = handle;
  if (handle.animations.length) animations = attachStoryAnimations(handle.elements.get(story.id)!, handle.animations);
  const advance = story.body.interaction?.advance;
  if (advance?.enabled) {
    const inputs = advance.inputs ?? ['controls'];
    controls = attachBeatControls(root, handle,
      inputs.includes('keyboard'), inputs.includes('flip'), story.body.interaction?.scroll?.snap === 'beats', inputs.includes('tap'));
    handle.refreshBeats();
  }
}

function destroyEnhancements() {
  controls?.destroy();
  controls = undefined;
  animations?.destroy();
  animations = undefined;
}

async function render(message: RenderMessage) {
  if (message.revision < revision || !Number.isSafeInteger(message.revision) || typeof message.text !== 'string') return;
  revision = message.revision;
  const result = validateStory(message.text);
  if (!result.document) {
    vscode.postMessage({ type: 'invalid', revision, message: result.diagnostics.find(item => item.severity === 'error')?.message ?? 'Invalid story document' });
    return;
  }
  if (message.blockedAssets?.length) {
    vscode.postMessage({ type: 'error', revision, message: `Asset path resolves outside this story package: ${message.blockedAssets[0]}` });
    return;
  }
  const assets = Object.create(null) as Record<string, string>;
  for (const [key, value] of Object.entries(message.assets ?? {})) {
    if (isStoryAssetPath(key) && typeof value === 'string' && value.length < 8192) assets[key] = value;
  }
  const story = result.document;
  const position = Number.isFinite(message.scrollY) ? message.scrollY : window.scrollY;
  const previousStory = currentStory;
  const previousHandle = current;
  destroyEnhancements();
  try {
    const handle = mountStory(root, story, {
      assetResolver: asset => resolveMappedAsset(asset, assets),
      onBeatsChange: () => root.dispatchEvent(new CustomEvent('story:beats')),
    });
    attachStory(story, handle);
    await handle.ready;
    if (revision !== message.revision) return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: Math.min(position, document.documentElement.scrollHeight - window.innerHeight), behavior: 'instant' });
      handle.refreshBeats();
    });
    root.querySelectorAll<HTMLImageElement>('img').forEach(image => {
      image.addEventListener('error', () => image.dataset.assetState = 'error', { once: true });
    });
    vscode.postMessage({ type: 'rendered', revision, width: window.innerWidth, height: window.innerHeight, missingAssets: message.missingAssets ?? [] });
  } catch (error) {
    if (previousStory && previousHandle && root.contains(previousHandle.elements.get(previousStory.id)!)) {
      attachStory(previousStory, previousHandle);
    }
    vscode.postMessage({ type: 'error', revision, message: error instanceof Error ? error.message : 'Unable to render this story' });
  }
}

window.addEventListener('message', event => {
  const message = event.data as { type?: unknown; revision?: unknown };
  if (!message || typeof message.type !== 'string') return;
  if (message.type === 'render') void render(message as RenderMessage);
  else if (message.type === 'restart' && message.revision === revision) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(sendPosition);
  }
});
window.addEventListener('resize', () => vscode.postMessage({ type: 'viewport', width: window.innerWidth, height: window.innerHeight }));
scrollListener = sendPosition;
window.addEventListener('scroll', scrollListener, { passive: true });
window.addEventListener('beforeunload', () => {
  destroyEnhancements();
  current?.destroy();
  current = undefined;
  window.removeEventListener('scroll', sendPosition);
  window.clearTimeout(positionTimer);
});
vscode.postMessage({ type: 'ready' });

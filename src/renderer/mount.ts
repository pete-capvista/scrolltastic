import { parseStory } from '../parser/parse';
import { renderFrame } from '../frames/render';
import { applyPanelHeight } from '../layout/position';
import { watchLayout } from '../layout/lifecycle';
import type { CardFrame, MaskShape, RevealAnimation } from '../model/story.generated';
import { createBeatIndex } from '../beats/controller';
import type { BeatBinding, PinBinding, ResolvedBeat, TimelineBeatBinding } from '../beats/model';
import './story.css';

export interface MountOptions { viewportBottomInset?: () => number; assetBaseUrl: string; onLayout?: () => void; onBeatsChange?: (beats: readonly ResolvedBeat[]) => void }
export type ScrollAnimationTarget = (
  | { kind: 'reveal'; panel: HTMLElement; content: HTMLElement; config: RevealAnimation }
  | { kind: 'pull-focus'; panel: HTMLElement; placement: HTMLElement; content: HTMLElement; shape: MaskShape; range: [number, number] }
  | { kind: 'card-out-crop'; panel: HTMLElement; pinElement?: HTMLElement; scrollMode: 'pin' | 'flow'; front: HTMLImageElement; mask: HTMLElement; source: HTMLImageElement; artWindow: CardFrame['cardGeometry']['artWindow']; range: [number, number]; focus: { x: number; y: number } }
  | { kind: 'card-fit'; panel: HTMLElement; pinElement?: HTMLElement; scrollMode: 'pin' | 'flow'; front: HTMLImageElement; mask: HTMLElement; source: HTMLImageElement; artWindow: CardFrame['cardGeometry']['artWindow']; aspectRatio: number; range: [number, number] } & (
    | { direction: 'in' | 'out' }
    | { direction: 'both'; inRange: [number, number]; outRange: [number, number] }
  )) & { beatTimeline?: TimelineBeatBinding; pinBinding?: PinBinding };
export interface StoryHandle {
  ready: Promise<void>;
  readonly beats: readonly ResolvedBeat[];
  refreshBeats(): void;
  elements: ReadonlyMap<string, HTMLElement>;
  animations: readonly ScrollAnimationTarget[];
  destroy(): void;
}
const mounts = new WeakMap<HTMLElement, StoryHandle>();

function wrapStoryPrefixThrough(body: HTMLElement, panel: HTMLElement) {
  const container = panel.parentElement;
  if (!container?.classList.contains('story-container') || container.parentElement !== body) {
    throw new Error('Pinned transitions require a Panel directly within a story Container.');
  }
  const prefix = document.createElement('div');
  prefix.className = 'story-pin-prefix';
  let node = body.firstChild;
  while (node && node !== container) {
    const next = node.nextSibling;
    prefix.append(node);
    node = next;
  }
  const nextContainer = container.nextSibling;
  const suffixContainer = container.cloneNode(false) as HTMLElement;
  let passedPanel = false;
  let child = container.firstChild;
  while (child) {
    const next = child.nextSibling;
    if (passedPanel) suffixContainer.append(child);
    else if (child === panel) passedPanel = true;
    child = next;
  }
  prefix.append(container);
  if (suffixContainer.firstChild) body.insertBefore(suffixContainer, nextContainer);
  const insertionPoint = suffixContainer.firstChild ? suffixContainer : nextContainer;
  body.insertBefore(prefix, insertionPoint);
  return prefix;
}

export function mountStory(root: HTMLElement, input: unknown, options: MountOptions): StoryHandle {
  const story = parseStory(input);
  const elements = new Map<string, HTMLElement>();
  const animations: ScrollAnimationTarget[] = [];
  const beatBindings: BeatBinding[] = [];
  const pins: PinBinding[] = [];
  const body = document.createElement('div');
  body.className = 'story-body';
  body.dataset.storyId = story.body.id;
  elements.set(story.body.id, body);
  const title = document.createElement('h1');
  title.className = 'story-title';
  title.textContent = story.body.title;
  body.append(title);
  for (const container of story.body.containers) {
    const section = document.createElement('section');
    section.className = 'story-container';
    section.dataset.containerId = container.id;
    elements.set(container.id, section);
    for (const item of container.flow) {
      if (item.type === 'space') {
        const space = document.createElement('div');
        space.className = 'story-space';
        space.style.height = item.height;
        space.style.background = item.background ?? '#ffffff';
        space.setAttribute('aria-hidden', 'true');
        section.append(space);
        continue;
      }
      const panel = document.createElement('article');
      panel.className = 'story-panel';
      panel.dataset.panelId = item.id;
      panel.dataset.heightMode = item.height.mode;
      elements.set(item.id, panel);
      if (item.beat) beatBindings.push({ kind: 'element', element: panel, beat: item.beat });
      applyPanelHeight(panel, item.height);
      let cardTransitionLayer: HTMLElement | undefined;
      let cardFitTransitionLayer: HTMLElement | undefined;
      for (const frame of item.frames) {
        const slot = renderFrame(frame, options.assetBaseUrl);
        panel.append(slot);
        const beatElement = slot.querySelector<HTMLElement>('.frame-placement')!;
        if (frame.beat) beatBindings.push({ kind: 'element', element: beatElement, beat: frame.beat });
        const timelineBeats = frame.type === 'card' ? frame.artwork?.transition.beats : frame.type === 'mask' ? frame.transition?.beats : undefined;
        const beatTimeline: TimelineBeatBinding | undefined = timelineBeats
          ? { kind: 'timeline', element: beatElement, beats: timelineBeats } : undefined;
        if (beatTimeline) beatBindings.push(beatTimeline);
        if ('scrollAnimation' in frame && frame.scrollAnimation) {
          const content = slot.querySelector<HTMLElement>('.frame-content');
          if (content) animations.push({ kind: 'reveal', panel, content, config: frame.scrollAnimation });
        }
        if (frame.type === 'mask' && frame.transition?.type === 'pull-focus') {
          const content = slot.querySelector<HTMLElement>('.frame-content');
          const placement = slot.querySelector<HTMLElement>('.frame-placement');
          if (content && placement) animations.push({ kind: 'pull-focus', beatTimeline, panel, placement, content, shape: frame.shape, range: frame.transition.range ?? [0.2, 0.65] });
        }
        if (frame.type === 'card' && frame.artwork?.transition) {
          const front = slot.querySelector<HTMLImageElement>('.frame-content--card img');
          const mask = slot.querySelector<HTMLElement>('.card-art-mask');
          const source = mask?.querySelector<HTMLImageElement>('.card-art-source');
          if (front && mask && source) {
            const isFit = frame.artwork.transition.presentation === 'fit';
            let transitionLayer = isFit ? cardFitTransitionLayer : cardTransitionLayer;
            if (!transitionLayer) {
              transitionLayer = document.createElement('div');
              transitionLayer.className = `panel-card-transitions${isFit ? ' panel-card-transitions--fit' : ''}`;
              transitionLayer.setAttribute('aria-hidden', 'true');
              if (isFit) cardFitTransitionLayer = transitionLayer;
              else cardTransitionLayer = transitionLayer;
            }
            mask.remove();
            transitionLayer.append(mask);
            if (isFit) {
              animations.push({
                kind: 'card-fit', beatTimeline, panel, front, mask, source,
                scrollMode: ['0.6', '0.7', '0.8', '0.9', '0.10', '0.11', '0.12', '0.13', '0.14'].includes(story.version) ? frame.artwork.transition.scrollMode ?? 'pin' : 'flow',
                artWindow: frame.cardGeometry.artWindow,
                aspectRatio: frame.aspectRatio,
                ...(frame.artwork.transition.direction === 'both' ? {
                  direction: 'both' as const,
                  inRange: frame.artwork.transition.inRange,
                  outRange: frame.artwork.transition.outRange,
                } : { direction: frame.artwork.transition.direction }),
                range: frame.artwork.transition.direction === 'both'
                  ? [frame.artwork.transition.inRange[0], frame.artwork.transition.outRange[1]]
                  : frame.artwork.transition.direction === 'in'
                  ? frame.artwork.transition.inRange ?? [0.18, 0.68]
                  : frame.artwork.transition.outRange ?? [0.18, 0.68],
              });
            } else {
              animations.push({
                kind: 'card-out-crop', beatTimeline, panel, front, mask, source,
                scrollMode: ['0.6', '0.7', '0.8', '0.9', '0.10', '0.11', '0.12', '0.13', '0.14'].includes(story.version) ? frame.artwork.transition.scrollMode ?? 'pin' : 'flow',
                artWindow: frame.cardGeometry.artWindow,
                range: frame.artwork.transition.outRange ?? [0.18, 0.73],
                focus: ('focus' in frame.artwork.transition ? frame.artwork.transition.focus : undefined) ?? { x: 0.5, y: 0.5 },
              });
            }
          }
        }
        if (frame.id) elements.set(frame.id, slot);
      }
      const transitionZ = item.frames.find(frame => frame.type === 'card' && frame.artwork?.transition)?.position?.z ?? 15;
      if (cardTransitionLayer) {
        cardTransitionLayer.style.zIndex = String(transitionZ);
        panel.append(cardTransitionLayer);
      }
      if (cardFitTransitionLayer) {
        cardFitTransitionLayer.style.zIndex = String(transitionZ);
        panel.append(cardFitTransitionLayer);
      }
      section.append(panel);
    }
    body.append(section);
  }
  const pinPrefixes = new Map<HTMLElement, HTMLElement>();
  for (const target of animations) {
    if ((target.kind === 'card-out-crop' || target.kind === 'card-fit') && target.scrollMode === 'pin') {
      target.pinElement = pinPrefixes.get(target.panel) ?? wrapStoryPrefixThrough(body, target.panel);
      pinPrefixes.set(target.panel, target.pinElement);
      target.pinBinding = { element: target.pinElement };
      pins.push(target.pinBinding);
    }
  }
  // Validate and construct before replacing an existing readable story.
  mounts.get(root)?.destroy();
  root.replaceChildren(body);
  const beatIndex = createBeatIndex(body, beatBindings, pins, options.onBeatsChange, options.viewportBottomInset);
  const lifecycle = watchLayout(body, () => {
    body.dispatchEvent(new CustomEvent('story:layout'));
    options.onLayout?.();
  });
  let destroyed = false;
  const handle: StoryHandle = {
    ready: lifecycle.ready.then(() => beatIndex.refresh()),
    get beats() { return beatIndex.beats; },
    refreshBeats: beatIndex.refresh,
    elements,
    animations,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      beatIndex.destroy();
      lifecycle.destroy();
      body.remove();
      elements.clear();
      if (mounts.get(root) === handle) mounts.delete(root);
    },
  };
  mounts.set(root, handle);
  return handle;
}

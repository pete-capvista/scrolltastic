import { parseStory } from '../parser/parse';
import { renderFrame } from '../frames/render';
import { applyPanelHeight } from '../layout/position';
import { watchLayout } from '../layout/lifecycle';
import type { CardFrame, MaskShape, RevealAnimation } from '../model/story.generated';
import './story.css';

export interface MountOptions { assetBaseUrl: string; onLayout?: () => void }
export type ScrollAnimationTarget =
  | { kind: 'reveal'; panel: HTMLElement; content: HTMLElement; config: RevealAnimation }
  | { kind: 'pull-focus'; panel: HTMLElement; placement: HTMLElement; content: HTMLElement; shape: MaskShape; range: [number, number] }
  | { kind: 'card-out-crop'; panel: HTMLElement; front: HTMLImageElement; mask: HTMLElement; source: HTMLImageElement; artWindow: CardFrame['cardGeometry']['artWindow']; range: [number, number]; focus: { x: number; y: number } };
export interface StoryHandle {
  ready: Promise<void>;
  elements: ReadonlyMap<string, HTMLElement>;
  animations: readonly ScrollAnimationTarget[];
  destroy(): void;
}
const mounts = new WeakMap<HTMLElement, StoryHandle>();

export function mountStory(root: HTMLElement, input: unknown, options: MountOptions): StoryHandle {
  const story = parseStory(input);
  const elements = new Map<string, HTMLElement>();
  const animations: ScrollAnimationTarget[] = [];
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
      applyPanelHeight(panel, item.height);
      let cardTransitionLayer: HTMLElement | undefined;
      for (const frame of item.frames) {
        const slot = renderFrame(frame, options.assetBaseUrl);
        panel.append(slot);
        if ('scrollAnimation' in frame && frame.scrollAnimation) {
          const content = slot.querySelector<HTMLElement>('.frame-content');
          if (content) animations.push({ kind: 'reveal', panel, content, config: frame.scrollAnimation });
        }
        if (frame.type === 'mask' && frame.transition?.type === 'pull-focus') {
          const content = slot.querySelector<HTMLElement>('.frame-content');
          const placement = slot.querySelector<HTMLElement>('.frame-placement');
          if (content && placement) animations.push({ kind: 'pull-focus', panel, placement, content, shape: frame.shape, range: frame.transition.range ?? [0.2, 0.65] });
        }
        if (frame.type === 'card' && frame.artwork?.transition) {
          const front = slot.querySelector<HTMLImageElement>('.frame-content--card img');
          const mask = slot.querySelector<HTMLElement>('.card-art-mask');
          const source = mask?.querySelector<HTMLImageElement>('.card-art-source');
          if (front && mask && source) {
            if (!cardTransitionLayer) {
              cardTransitionLayer = document.createElement('div');
              cardTransitionLayer.className = 'panel-card-transitions';
              cardTransitionLayer.setAttribute('aria-hidden', 'true');
            }
            mask.remove();
            cardTransitionLayer.append(mask);
            animations.push({
              kind: 'card-out-crop', panel, front, mask, source,
              artWindow: frame.cardGeometry.artWindow,
              range: frame.artwork.transition.outRange ?? [0.18, 0.73],
              focus: frame.artwork.transition.focus ?? { x: 0.5, y: 0.5 },
            });
          }
        }
        if (frame.id) elements.set(frame.id, slot);
      }
      if (cardTransitionLayer) {
        cardTransitionLayer.style.zIndex = String(item.frames.find(frame => frame.type === 'card' && frame.artwork?.transition)?.position?.z ?? 15);
        panel.append(cardTransitionLayer);
      }
      section.append(panel);
    }
    body.append(section);
  }
  // Validate and construct before replacing an existing readable story.
  mounts.get(root)?.destroy();
  root.replaceChildren(body);
  const lifecycle = watchLayout(body, () => {
    body.dispatchEvent(new CustomEvent('story:layout'));
    options.onLayout?.();
  });
  let destroyed = false;
  const handle: StoryHandle = {
    ready: lifecycle.ready,
    elements,
    animations,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      lifecycle.destroy();
      body.remove();
      elements.clear();
      if (mounts.get(root) === handle) mounts.delete(root);
    },
  };
  mounts.set(root, handle);
  return handle;
}

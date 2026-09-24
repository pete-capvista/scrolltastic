import { parseStory } from '../parser/parse';
import { renderFrame } from '../frames/render';
import { applyPanelHeight } from '../layout/position';
import { watchLayout } from '../layout/lifecycle';
import './story.css';

export interface MountOptions { assetBaseUrl: string; onLayout?: () => void }
export interface StoryHandle {
  ready: Promise<void>;
  elements: ReadonlyMap<string, HTMLElement>;
  destroy(): void;
}
const mounts = new WeakMap<HTMLElement, StoryHandle>();

export function mountStory(root: HTMLElement, input: unknown, options: MountOptions): StoryHandle {
  const story = parseStory(input);
  const elements = new Map<string, HTMLElement>();
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
      for (const frame of item.frames) {
        const slot = renderFrame(frame, options.assetBaseUrl);
        panel.append(slot);
        if (frame.id) elements.set(frame.id, slot);
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

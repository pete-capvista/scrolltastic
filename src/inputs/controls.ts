import { attachTap } from './tap';
import { attachScrollSnap } from './scroll-snap';
import { attachFlip } from './flip';
import { createKeyboardAdapter } from './keyboard';
import type { StoryHandle } from '../renderer/mount';
import { createBeatNavigation } from '../interaction/navigation';
import { createScrollDriver } from '../animation/assisted-scroll';

export interface ControlsHandle { readonly height: number; destroy(): void }

/** Reference input adapter. Native buttons also provide Tab/Enter/Space access. */
export function attachBeatControls(host: HTMLElement, story: StoryHandle, keyboardEnabled = false, flipEnabled = false, snapEnabled = false, tapEnabled = false, showControls = true): ControlsHandle {
  const controls = document.createElement('nav');
  controls.className = `reader-controls${showControls ? '' : ' reader-controls--hidden'}`;
  controls.setAttribute('aria-label', 'Story navigation');
  const previous = document.createElement('button');
  previous.type = 'button'; previous.textContent = 'Previous';
  const next = document.createElement('button');
  next.type = 'button'; next.textContent = 'Next';
  controls.append(previous, next);
  document.body.append(controls);
  const oldPadding = host.style.paddingBottom;
  const measure = () => {
    host.style.paddingBottom = `${controls.getBoundingClientRect().height}px`;
    story.refreshBeats();
    host.querySelector('.story-body')?.dispatchEvent(new CustomEvent('story:layout'));
  };
  const navigation = createBeatNavigation({
    readBeats: () => { story.refreshBeats(); return story.beats; },
    readScrollY: () => window.scrollY,
    driver: createScrollDriver(),
  });
  const unsubscribe = navigation.subscribe(state => {
    // aria-disabled keeps focus on a control when it reaches a story boundary.
    previous.setAttribute('aria-disabled', String(!state.canReverse));
    next.setAttribute('aria-disabled', String(!state.canAdvance));
    controls.dataset.moving = String(state.moving);
    if (state.destinationId) controls.dataset.destinationId = state.destinationId;
    else delete controls.dataset.destinationId;
  });
  previous.addEventListener('click', navigation.reverse);
  next.addEventListener('click', navigation.advance);
  const isControl = (event: Event) => event.target instanceof Node && controls.contains(event.target);
  const interrupt = (event: Event) => { if (!isControl(event)) navigation.cancel(); };
  const wheel = () => navigation.cancel();
  const keyboard = keyboardEnabled ? createKeyboardAdapter(host, controls, navigation) : undefined;
  if (keyboardEnabled) {
    previous.setAttribute('aria-keyshortcuts', 'ArrowUp');
    next.setAttribute('aria-keyshortcuts', 'ArrowDown');
    previous.title = 'Previous Beat (Arrow Up)';
    next.title = 'Next Beat (Arrow Down)';
  }
  const tap = tapEnabled ? attachTap(host, navigation) : undefined;
  const snap = snapEnabled ? attachScrollSnap(host, navigation) : undefined;
  const flip = flipEnabled ? attachFlip(host, navigation) : undefined;
  const key = (event: KeyboardEvent) => {
    if (keyboard?.handle(event)) return;
    if (event.key === 'Escape' || ((event.key !== ' ' || !isControl(event)) && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key))) navigation.cancel();
  };
  let pending = 0;
  const update = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => { pending = 0; navigation.update(); });
  };
  const resize = () => { navigation.cancel(); measure(); update(); };
  const observer = new ResizeObserver(measure);
  observer.observe(controls);
  window.addEventListener('wheel', wheel, { passive: true });
  window.addEventListener('touchstart', interrupt, { passive: true });
  window.addEventListener('pointerdown', interrupt, { passive: true });
  window.addEventListener('keydown', key);
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', resize);
  host.addEventListener('story:beats', update);
  measure();
  return {
    get height() { return controls.getBoundingClientRect().height; },
    destroy() {
      tap?.destroy();
      snap?.destroy();
      flip?.destroy();
      keyboard?.destroy();
      navigation.destroy(); unsubscribe(); observer.disconnect();
      cancelAnimationFrame(pending);
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('touchstart', interrupt);
      window.removeEventListener('pointerdown', interrupt);
      window.removeEventListener('keydown', key);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', resize);
      host.removeEventListener('story:beats', update);
      previous.removeEventListener('click', navigation.reverse);
      next.removeEventListener('click', navigation.advance);
      controls.remove();
      host.style.paddingBottom = oldPadding;
    },
  };
}

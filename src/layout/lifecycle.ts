import { updateNormalClipping } from './clipping';

export interface LayoutLifecycle { ready: Promise<void>; destroy(): void }

export function watchLayout(root: HTMLElement, onLayout: () => void): LayoutLifecycle {
  let destroyed = false;
  let frame = 0;
  let settle!: () => void;
  const ready = new Promise<void>(resolve => { settle = resolve; });
  const schedule = () => {
    if (destroyed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!destroyed) {
        updateNormalClipping(root);
        // FIT transitions change Panel height on every scrub frame. Keep clipping
        // current, but avoid refreshing ScrollTrigger until that motion ends.
        if (!root.querySelector('.story-panel[data-card-fit-active="true"], .story-pin-prefix[data-story-prefix-pinned="true"]')) onLayout();
      }
    });
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(root);
  for (const element of root.querySelectorAll('.story-panel, .frame-slot--normal')) observer.observe(element);
  const markImage = (event: Event) => {
    const img = event.target;
    if (img instanceof HTMLImageElement) img.dataset.assetState = event.type === 'error' ? 'error' : 'loaded';
    schedule();
  };
  root.addEventListener('load', markImage, true);
  root.addEventListener('error', markImage, true);
  window.addEventListener('resize', schedule);
  document.fonts?.addEventListener('loadingdone', schedule);
  let readyFrame = 0;
  let fontsSettled = false;
  const finish = () => {
    if (destroyed || fontsSettled) return;
    fontsSettled = true;
    clearTimeout(timeout);
    readyFrame = requestAnimationFrame(() => {
      if (!destroyed) {
        updateNormalClipping(root);
        onLayout();
      }
      settle();
    });
  };
  const timeout = window.setTimeout(finish, 2000);
  if (document.fonts) void document.fonts.ready.then(finish, finish);
  else finish();
  return {
    ready,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(readyFrame);
      clearTimeout(timeout);
      root.removeEventListener('load', markImage, true);
      root.removeEventListener('error', markImage, true);
      window.removeEventListener('resize', schedule);
      document.fonts?.removeEventListener('loadingdone', schedule);
      settle();
    },
  };
}

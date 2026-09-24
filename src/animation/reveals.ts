import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { ScrollAnimationTarget } from '../renderer/mount';
import { maskClipPath } from '../frames/mask-geometry';

export interface AnimationHandle { destroy(): void }

/** Attach only validated authored reveals after the renderer's first layout settles. */
export function attachStoryAnimations(root: HTMLElement, targets: readonly ScrollAnimationTarget[]): AnimationHandle {
  if (!targets.length) return { destroy() {} };
  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia(root);
  media.add('(prefers-reduced-motion: no-preference)', () => {
    for (const target of targets) {
      if (target.kind === 'pull-focus') {
        const [start, end] = target.range;
        const duration = end - start;
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: target.panel,
            start: 'clamp(top bottom)',
            end: 'clamp(bottom top)',
            scrub: true,
            invalidateOnRefresh: true,
          },
        });
        // Keep the timeline duration at one so the authored range remains a
        // normalized position across the entire Panel entry-to-exit interval.
        timeline.to({}, { duration: 1 }, 0);
        timeline.to(target.placement, {
          left: 0, top: 0, width: '100%', height: '100%', xPercent: 0, yPercent: 0,
          duration, ease: 'none',
        }, start);
        timeline.to(target.content, {
          clipPath: maskClipPath(target.shape, true), duration, ease: 'none',
        }, start);
        continue;
      }
      const { panel, content, config } = target;
      const from = config.from ?? {};
      gsap.fromTo(content, {
        opacity: from.opacity ?? 0,
        yPercent: from.yPercent ?? 8,
        scale: from.scale ?? 0.97,
      }, {
        opacity: 1,
        yPercent: 0,
        scale: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: panel,
          start: config.start ?? 'top 82%',
          end: config.end ?? 'top 55%',
          scrub: true,
          invalidateOnRefresh: true,
        },
      });
    }
  });

  let refreshFrame = 0;
  const refresh = () => {
    if (refreshFrame) cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      ScrollTrigger.refresh(true);
    });
  };
  root.addEventListener('story:layout', refresh);
  refresh();
  return {
    destroy() {
      root.removeEventListener('story:layout', refresh);
      cancelAnimationFrame(refreshFrame);
      media.revert();
    },
  };
}

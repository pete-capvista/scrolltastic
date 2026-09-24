import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { ScrollAnimationTarget } from '../renderer/mount';
import { maskClipPath } from '../frames/mask-geometry';

export interface AnimationHandle { destroy(): void }

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function resetCardCrop(target: Extract<ScrollAnimationTarget, { kind: 'card-out-crop' }>) {
  const panel = target.panel.getBoundingClientRect();
  const card = target.front.getBoundingClientRect();
  const window = target.artWindow;
  const maskWidth = card.width * window.width;
  const maskHeight = card.height * window.height;
  gsap.set(target.front, { opacity: 1 });
  gsap.set(target.mask, {
    left: card.left - panel.left + card.width * window.x,
    top: card.top - panel.top + card.height * window.y,
    width: maskWidth,
    height: maskHeight,
    borderRadius: Math.min(maskWidth, maskHeight) * 0.025,
    autoAlpha: 0,
  });
  gsap.set(target.source, {
    left: -card.width * window.x,
    top: -card.height * window.y,
    width: card.width,
    height: card.height,
  });
}

function cardCropCover(target: Extract<ScrollAnimationTarget, { kind: 'card-out-crop' }>) {
  const card = target.front.getBoundingClientRect();
  const panelWidth = target.panel.clientWidth;
  const panelHeight = target.panel.clientHeight;
  const window = target.artWindow;
  const scale = Math.max(panelWidth / (card.width * window.width), panelHeight / (card.height * window.height));
  const sourceWidth = card.width * scale;
  const sourceHeight = card.height * scale;
  const artWidth = sourceWidth * window.width;
  const artHeight = sourceHeight * window.height;
  const left = clamp(panelWidth / 2 - artWidth * target.focus.x, panelWidth - artWidth, 0);
  const top = clamp(panelHeight / 2 - artHeight * target.focus.y, panelHeight - artHeight, 0);
  return {
    left: left - window.x * sourceWidth,
    top: top - window.y * sourceHeight,
    width: sourceWidth,
    height: sourceHeight,
  };
}

/** Attach only validated authored reveals after the renderer's first layout settles. */
export function attachStoryAnimations(root: HTMLElement, targets: readonly ScrollAnimationTarget[]): AnimationHandle {
  if (!targets.length) return { destroy() {} };
  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia(root);
  media.add('(prefers-reduced-motion: no-preference)', () => {
    for (const target of targets) {
      if (target.kind === 'card-out-crop') {
        const [start, end] = target.range;
        const duration = end - start;
        resetCardCrop(target);
        let cover = cardCropCover(target);
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: target.panel,
            start: 'clamp(top bottom)',
            end: 'clamp(bottom top)',
            scrub: true,
            invalidateOnRefresh: true,
            onRefreshInit: () => {
              resetCardCrop(target);
              cover = cardCropCover(target);
            },
          },
        });
        timeline.to({}, { duration: 1 }, 0);
        timeline.to(target.mask, {
          left: 0,
          top: 0,
          width: () => target.panel.clientWidth,
          height: () => target.panel.clientHeight,
          borderRadius: 0,
          autoAlpha: 1,
          duration,
          ease: 'none',
        }, start);
        timeline.to(target.source, {
          left: () => cover.left,
          top: () => cover.top,
          width: () => cover.width,
          height: () => cover.height,
          duration,
          ease: 'none',
        }, start);
        timeline.to(target.front, {
          opacity: 0,
          duration: duration * (0.35 / 0.55),
          ease: 'none',
        }, start + duration * (0.02 / 0.55));
        continue;
      }
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

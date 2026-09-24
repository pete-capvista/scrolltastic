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

function fitDimensions(target: Extract<ScrollAnimationTarget, { kind: 'card-fit' }>) {
  const panelWidth = target.panel.clientWidth;
  const panelRect = target.panel.getBoundingClientRect();
  const cardRect = target.front.getBoundingClientRect();
  const { artWindow } = target;
  const sourceWidth = panelWidth / target.artWindow.width;
  const sourceHeight = sourceWidth / target.aspectRatio;
  const panelHeight = sourceHeight * target.artWindow.height;
  const centerX = cardRect.left - panelRect.left + cardRect.width * (artWindow.x + artWindow.width / 2);
  const centerY = cardRect.top - panelRect.top + cardRect.height * (artWindow.y + artWindow.height / 2);
  const sourceLeft = panelWidth / 2 - cardRect.width * (artWindow.x + artWindow.width / 2);
  const sourceTop = panelHeight / 2 - cardRect.height * (artWindow.y + artWindow.height / 2);
  const targetSourceLeft = panelWidth / 2 - sourceWidth * (artWindow.x + artWindow.width / 2);
  const targetSourceTop = panelHeight / 2 - sourceHeight * (artWindow.y + artWindow.height / 2);
  const startWindowWidth = cardRect.width * artWindow.width;
  const startWindowHeight = cardRect.height * artWindow.height;
  const clipTop = (panelHeight - startWindowHeight) / 2;
  const clipRight = (panelWidth - startWindowWidth) / 2;
  return {
    panelHeight,
    stageLeft: centerX - panelWidth / 2,
    stageTop: centerY - panelHeight / 2,
    stageWidth: panelWidth,
    clipFrom: `inset(${clipTop}px ${clipRight}px ${clipTop}px ${clipRight}px)`,
    sourceLeft,
    sourceTop,
    sourceX: targetSourceLeft - sourceLeft,
    sourceY: targetSourceTop - sourceTop,
    sourceScaleX: sourceWidth / cardRect.width,
    sourceScaleY: sourceHeight / cardRect.height,
  };
}

function naturalPanelHeight(panel: HTMLElement) {
  const previous = panel.style.height;
  panel.style.height = 'auto';
  const height = Math.max(panel.getBoundingClientRect().height, panel.scrollHeight);
  panel.style.height = previous;
  return height;
}

function attachTransitionPin(target: Extract<ScrollAnimationTarget, { kind: 'card-out-crop' | 'card-fit' }>) {
  const pin = target.pinElement;
  if (target.scrollMode !== 'pin' || !pin) return () => {};
  let panelTop = target.panel.getBoundingClientRect().top + window.scrollY;
  let sceneHeight = target.kind === 'card-fit' ? naturalPanelHeight(target.panel) : target.panel.getBoundingClientRect().height;
  const metrics = () => {
    const start = Math.max(0, panelTop - window.innerHeight);
    const end = panelTop + sceneHeight;
    return [start, end] as const;
  };
  const [rangeStart, rangeEnd] = target.range;
  // Pin spacing reserves phase distance, but a short story can still be less
  // than one viewport tall after FIT contraction. Keep the end reachable without
  // changing Panel sizing or displacing any following authored compositions.
  const body = target.kind === 'card-fit' && target.direction === 'both'
    ? target.panel.closest<HTMLElement>('.story-body') : null;
  const previousMinHeight = body?.style.minHeight ?? '';
  const reserveScrollEnd = () => {
    if (!body) return;
    const [start, end] = metrics();
    const bodyTop = body.getBoundingClientRect().top + window.scrollY;
    body.style.minHeight = `${Math.ceil(start + rangeEnd * (end - start) + window.innerHeight - bodyTop)}px`;
  };
  reserveScrollEnd();
  let trigger: ReturnType<typeof ScrollTrigger.create> | undefined;
  let hasPinned = false;
  trigger = ScrollTrigger.create({
    trigger: target.panel,
    start: () => {
      const [start, end] = metrics();
      return start + rangeStart * (end - start);
    },
    end: () => {
      const [start, end] = metrics();
      return start + rangeEnd * (end - start);
    },
    onRefresh: self => {
      if (target.pinBinding) target.pinBinding.range = { start: self.start, end: self.end };
    },
    pin,
    // IN and BOTH grow the Panel while its prefix is pinned. Reserve the
    // authored interval so every phase is reachable even in a short story.
    pinSpacing: target.kind === 'card-fit' && target.direction !== 'out',
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onRefreshInit: () => {
      // Once pinned, keep this trigger's authored document coordinate stable;
      // ScrollTrigger temporarily unpins elements while refreshing geometry.
      if (!hasPinned && !trigger?.isActive && !pin.dataset.storyPrefixPinned && getComputedStyle(pin).position !== 'fixed') {
        panelTop = target.panel.getBoundingClientRect().top + window.scrollY;
      }
      sceneHeight = target.kind === 'card-fit' ? naturalPanelHeight(target.panel) : target.panel.getBoundingClientRect().height;
      reserveScrollEnd();
    },
    onToggle: self => {
      if (self.isActive) {
        hasPinned = true;
        pin.dataset.storyPrefixPinned = 'true';
      }
      else delete pin.dataset.storyPrefixPinned;
    },
  });
  return () => {
    trigger.kill();
    if (target.pinBinding) delete target.pinBinding.range;
    if (body) body.style.minHeight = previousMinHeight;
    delete pin.dataset.storyPrefixPinned;
  };
}

function resetCardFit(target: Extract<ScrollAnimationTarget, { kind: 'card-fit' }>, naturalHeight: number, dimensions: ReturnType<typeof fitDimensions>) {
  const cardRect = target.front.getBoundingClientRect();
  const entering = target.direction !== 'out';
  target.panel.style.height = `${entering ? dimensions.panelHeight : naturalHeight}px`;
  gsap.set(target.front, { opacity: entering ? 0 : 1 });
  gsap.set(target.mask, {
    left: dimensions.stageLeft,
    top: dimensions.stageTop,
    width: dimensions.stageWidth,
    height: dimensions.panelHeight,
    clipPath: entering ? 'inset(0px)' : dimensions.clipFrom,
    autoAlpha: entering ? 1 : 0,
    willChange: 'clip-path',
  });
  gsap.set(target.source, {
    left: dimensions.sourceLeft,
    top: dimensions.sourceTop,
    width: cardRect.width,
    height: cardRect.height,
    x: entering ? dimensions.sourceX : 0,
    y: entering ? dimensions.sourceY : 0,
    scaleX: entering ? dimensions.sourceScaleX : 1,
    scaleY: entering ? dimensions.sourceScaleY : 1,
    transformOrigin: 'top left',
    willChange: 'transform',
  });
}

function attachCardFit(target: Extract<ScrollAnimationTarget, { kind: 'card-fit' }>) {
  const cleanupPin = attachTransitionPin(target);
  const [start, end] = target.range;
  let naturalHeight = naturalPanelHeight(target.panel);
  let dimensions = fitDimensions(target);
  let panelTop = target.panel.getBoundingClientRect().top + window.scrollY;
  resetCardFit(target, naturalHeight, dimensions);
  let active = false;
  let transitionStarted = false;
  let artStacked = false;
  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    if (next) {
      transitionStarted = true;
      target.panel.dataset.cardFitActive = 'true';
    }
    else {
      delete target.panel.dataset.cardFitActive;
      if (!target.pinElement) target.panel.dispatchEvent(new CustomEvent('story:layout', { bubbles: true }));
    }
  };
  const setArtStacked = (next: boolean) => {
    if (artStacked === next) return;
    artStacked = next;
    if (target.pinElement) {
      if (next) target.pinElement.dataset.storyPrefixArtActive = 'true';
      else delete target.pinElement.dataset.storyPrefixArtActive;
    }
  };
  if (target.direction !== 'out') setArtStacked(true);
  const timeline = gsap.timeline({
    scrollTrigger: {
      trigger: target.panel,
      start: () => Math.max(0, panelTop - window.innerHeight),
      end: () => panelTop + naturalHeight,
      scrub: true,
      invalidateOnRefresh: true,
      onRefresh: self => {
        if (target.beatTimeline) target.beatTimeline.range = { start: self.start, end: self.end };
      },
      onRefreshInit: () => {
        naturalHeight = naturalPanelHeight(target.panel);
        if (!transitionStarted && !target.pinElement?.dataset.storyPrefixPinned) {
          panelTop = target.panel.getBoundingClientRect().top + window.scrollY;
        }
        dimensions = fitDimensions(target);
        resetCardFit(target, naturalHeight, dimensions);
      },
      onUpdate: self => {
        setActive(self.progress > start && self.progress < end);
        setArtStacked(target.direction !== 'out' ? self.progress < 1 : self.progress >= start && self.progress < 1);
      },
      onLeave: () => { setActive(false); setArtStacked(false); },
      onLeaveBack: () => { setActive(false); setArtStacked(false); },
    },
  });
  timeline.to({}, { duration: 1 }, 0);
  const addPhase = (direction: 'in' | 'out', range: [number, number]) => {
    const [phaseStart, phaseEnd] = range;
    const duration = phaseEnd - phaseStart;
    const entering = direction === 'in';
    // Explicit phase endpoints keep the second leg independent of GSAP's
    // cached start values when the reader reverses or geometry is refreshed.
    const artHeight = () => dimensions.panelHeight;
    const cardHeight = () => naturalHeight;
    timeline.fromTo(target.panel, {
      height: entering ? artHeight : cardHeight,
    }, {
      height: entering ? cardHeight : artHeight,
      duration, ease: 'none', immediateRender: false,
    }, phaseStart);
    timeline.fromTo(target.mask, {
      clipPath: entering ? 'inset(0px)' : () => dimensions.clipFrom,
      autoAlpha: entering || target.direction === 'both' ? 1 : 0,
    }, {
      clipPath: entering ? () => dimensions.clipFrom : 'inset(0px)',
      autoAlpha: 1,
      duration, ease: 'none', immediateRender: false,
    }, phaseStart);
    timeline.fromTo(target.source, {
      x: () => entering ? dimensions.sourceX : 0,
      y: () => entering ? dimensions.sourceY : 0,
      scaleX: () => entering ? dimensions.sourceScaleX : 1,
      scaleY: () => entering ? dimensions.sourceScaleY : 1,
    }, {
      x: () => entering ? 0 : dimensions.sourceX,
      y: () => entering ? 0 : dimensions.sourceY,
      scaleX: () => entering ? 1 : dimensions.sourceScaleX,
      scaleY: () => entering ? 1 : dimensions.sourceScaleY,
      duration, ease: 'none', immediateRender: false,
    }, phaseStart);
    timeline.fromTo(target.front, { opacity: entering ? 0 : 1 }, {
      opacity: entering ? 1 : 0,
      duration: duration * (0.35 / 0.5), ease: 'none', immediateRender: false,
    }, phaseStart + duration * (0.02 / 0.5));
  };
  if (target.direction === 'both') {
    addPhase('in', target.inRange);
    // No tweens during holdRange or gaps: retain the resolved physical Card.
    addPhase('out', target.outRange);
  } else addPhase(target.direction, target.range);
  return () => {
    setActive(false);
    setArtStacked(false);
    cleanupPin();
    target.panel.style.removeProperty('height');
    gsap.set([target.front, target.mask, target.source], { clearProps: 'all' });
  };
}

/** Attach only validated authored reveals after the renderer's first layout settles. */
export function attachStoryAnimations(root: HTMLElement, targets: readonly ScrollAnimationTarget[]): AnimationHandle {
  if (!targets.length) return { destroy() {} };
  gsap.registerPlugin(ScrollTrigger);
  let notifyFrame = 0;
  const notifyBeats = () => {
    cancelAnimationFrame(notifyFrame);
    notifyFrame = requestAnimationFrame(() => {
      notifyFrame = 0;
      root.dispatchEvent(new CustomEvent('story:animation-refresh'));
    });
  };
  ScrollTrigger.addEventListener('refresh', notifyBeats);
  const createMedia = () => {
    const media = gsap.matchMedia(root);
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const cleanups: Array<() => void> = [];
      for (const target of targets) {
        if (target.kind === 'card-fit') {
          cleanups.push(attachCardFit(target));
          continue;
        }
        if (target.kind === 'card-out-crop') {
          cleanups.push(attachTransitionPin(target));
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
              onRefresh: self => {
                if (target.beatTimeline) target.beatTimeline.range = { start: self.start, end: self.end };
              },
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
              onRefresh: self => {
                if (target.beatTimeline) target.beatTimeline.range = { start: self.start, end: self.end };
              },
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
      notifyBeats();
      return () => {
        cleanups.forEach(cleanup => cleanup());
        for (const target of targets) {
          if (target.beatTimeline) delete target.beatTimeline.range;
          if (target.pinBinding) delete target.pinBinding.range;
        }
        notifyBeats();
      };
    });

    return media;
  };
  let media = createMedia();
  let resizeTimer = 0;
  let viewportWidth = window.innerWidth;
  let viewportHeight = window.innerHeight;
  const resize = () => {
    if (viewportWidth === window.innerWidth && viewportHeight === window.innerHeight) return;
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      // A fixed pin retains its old width during refreshInit. Tear down our
      // context first so all geometry is measured in responsive document flow.
      media.revert();
      media = createMedia();
      refresh();
    }, 150);
  };
  window.addEventListener('resize', resize);

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
      window.removeEventListener('resize', resize);
      clearTimeout(resizeTimer);
      cancelAnimationFrame(refreshFrame);
      media.revert();
      ScrollTrigger.removeEventListener('refresh', notifyBeats);
      cancelAnimationFrame(notifyFrame);
      root.dispatchEvent(new CustomEvent('story:animation-refresh'));
    },
  };
}

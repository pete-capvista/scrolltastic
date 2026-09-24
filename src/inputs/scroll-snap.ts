import type { BeatNavigation } from '../interaction/navigation';

const scrollKeys = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']);
const interactive = 'a, button, input, textarea, select, summary, audio, video, iframe, [contenteditable], [role], [aria-haspopup]';

/** Observe native scrolling. Never intercept a drag or write its position. */
export function attachScrollSnap(host: HTMLElement, navigation: BeatNavigation): { destroy(): void } {
  const nativeEnd = 'onscrollend' in document;
  let touches = 0;
  let mouseDown = false;
  const keys = new Set<string>();
  let armed = false;
  let moved = false;
  let origin = window.scrollY;
  let lastScrollY = window.scrollY;
  let moving = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };
  const disarm = () => { clearTimer(); armed = false; moved = false; };
  const held = () => touches > 0 || mouseDown || keys.size > 0;
  const eligible = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement) || !host.contains(target) || target.isContentEditable || target.closest(interactive)) return false;
    if ((window.visualViewport?.scale ?? 1) !== 1 || window.getSelection()?.isCollapsed === false) return false;
    for (let element: HTMLElement | null = target; element && element !== host; element = element.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) return false;
    }
    return true;
  };
  const expireUnmoved = () => {
    if (!armed || moved || held()) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = undefined;
      if (!moved && !held()) disarm();
    }, 180);
  };
  const arm = (startY = window.scrollY) => {
    clearTimer();
    if (!armed) { armed = true; moved = false; origin = startY; }
    expireUnmoved();
  };
  const schedule = () => {
    clearTimer();
    if (!armed || held() || moving) return;
    if (!moved) { expireUnmoved(); return; }
    // Also group discrete wheel ticks. Continued momentum always cancels this
    // timer; browsers without scrollend use the same quiet-period fallback.
    timer = setTimeout(() => {
      timer = undefined;
      if (!armed || !moved || held() || moving || document.hidden || (window.visualViewport?.scale ?? 1) !== 1) return;
      disarm(); // Do not interpret the snap's own scroll events as new input.
      navigation.snap();
    }, 180);
  };
  const unsubscribe = navigation.subscribe(state => {
    moving = state.moving;
    if (moving) disarm(); // Explicit buttons/keyboard actions own their destination.
  });
  const scroll = (event: Event) => {
    if (event.target !== document) return;
    lastScrollY = window.scrollY;
    if (!armed || moving) return;
    clearTimer();
    moved ||= Math.abs(window.scrollY - origin) > 2;
    if (!nativeEnd) schedule();
  };
  const scrollEnd = (event: Event) => { if (event.target === document) schedule(); };
  const touchStart = (event: TouchEvent) => {
    disarm(); navigation.cancel();
    touches = event.touches.length;
    if (touches === 1 && !event.defaultPrevented && eligible(event.target)) arm();
  };
  const touchMove = (event: TouchEvent) => { touches = event.touches.length; if (touches !== 1) disarm(); };
  const touchEnd = (event: TouchEvent) => {
    touches = event.touches.length;
    if (!nativeEnd) schedule(); else expireUnmoved();
  };
  const touchCancel = () => { touches = 0; disarm(); navigation.cancel(); };
  const wheel = (event: WheelEvent) => {
    // Passive wheel delivery may follow the compositor's scroll write. Use the
    // last document scroll event as the origin, not an already-updated scrollY.
    navigation.cancel();
    if (!event.defaultPrevented && !event.ctrlKey && Math.abs(event.deltaY) > 0 && eligible(event.target)) arm(lastScrollY);
    else disarm();
  };
  const pointerDown = (event: PointerEvent) => {
    // Touch pointercancel fires when the browser takes over panning; TouchEvents
    // above keep the finger-down guard until actual release.
    if (event.pointerType === 'touch') return;
    disarm(); navigation.cancel(); mouseDown = true;
    if (event.button === 0 && (eligible(event.target) || event.target === document.documentElement)) arm();
  };
  const pointerUp = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    mouseDown = false;
    if (!nativeEnd) schedule(); else expireUnmoved();
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { disarm(); navigation.cancel(); return; }
    if (!scrollKeys.has(event.key)) return;
    keys.add(event.key);
    if (!event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey && eligible(event.target)) arm();
    else disarm();
  };
  const keyUp = (event: KeyboardEvent) => { keys.delete(event.key); if (!nativeEnd) schedule(); else expireUnmoved(); };
  const reset = () => { disarm(); touches = 0; mouseDown = false; keys.clear(); navigation.cancel(); };
  window.addEventListener('scroll', scroll, { passive: true });
  document.addEventListener('scrollend', scrollEnd);
  window.addEventListener('touchstart', touchStart, { passive: true });
  window.addEventListener('touchmove', touchMove, { passive: true });
  window.addEventListener('touchend', touchEnd, { passive: true });
  window.addEventListener('touchcancel', touchCancel, { passive: true });
  window.addEventListener('wheel', wheel, { passive: true });
  window.addEventListener('pointerdown', pointerDown, { passive: true });
  window.addEventListener('pointerup', pointerUp, { passive: true });
  window.addEventListener('pointercancel', pointerUp, { passive: true });
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('resize', reset);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', reset);
  return {
    destroy() {
      disarm(); unsubscribe();
      window.removeEventListener('scroll', scroll);
      document.removeEventListener('scrollend', scrollEnd);
      window.removeEventListener('touchstart', touchStart);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', touchEnd);
      window.removeEventListener('touchcancel', touchCancel);
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerUp);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('resize', reset);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', reset);
    },
  };
}

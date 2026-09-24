import type { BeatNavigation, NavigationState } from '../interaction/navigation';
import { canClaimFlip, flipDirection, flipLimits, isFlip, type TouchSample } from './flip-gesture';

const interactive = 'a, button, input, textarea, select, summary, audio, video, iframe, [contenteditable], [role], [aria-haspopup]';
interface Gesture {
  id: number;
  start: TouchSample;
  latest: TouchSample;
  origin: number;
  mode: 'pending' | 'claimed' | 'drag';
  sign: number;
  furthest: number;
}

/** Short touch flicks invoke actions; unclaimed gestures stay entirely native. */
export function attachFlip(host: HTMLElement, navigation: BeatNavigation): { destroy(): void } {
  let state: NavigationState;
  const unsubscribe = navigation.subscribe(value => { state = value; });
  let gesture: Gesture | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let suppressClickUntil = 0;
  const sample = (touch: Touch): TouchSample => ({ x: touch.clientX, y: touch.clientY, time: performance.now() });
  const clear = () => { clearTimeout(timer); timer = undefined; gesture = undefined; };
  const drag = (current: Gesture) => {
    clearTimeout(timer); timer = undefined;
    current.mode = 'drag';
    // A fast start that turns into a long drag must still expose every scroll
    // position. Native momentum was withheld only for this claimed gesture.
    window.scrollTo({ top: current.origin - (current.latest.y - current.start.y), behavior: 'instant' });
  };
  const start = (event: TouchEvent) => {
    clear();
    suppressClickUntil = 0; // A new contact is intentional, not a compatibility click.
    if (event.defaultPrevented || event.touches.length !== 1 || state.moving) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.isContentEditable || target.closest(interactive)) return;
    if (!window.getSelection()?.isCollapsed || (window.visualViewport?.scale ?? 1) !== 1) return;
    // Nested scrolling belongs to that widget, not to document Beat navigation.
    for (let element: HTMLElement | null = target; element && element !== host; element = element.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) return;
    }
    const touch = event.touches[0];
    const point = sample(touch);
    gesture = { id: touch.identifier, start: point, latest: point, origin: window.scrollY, mode: 'pending', sign: 0, furthest: 0 };
  };
  const move = (event: TouchEvent) => {
    const current = gesture;
    if (!current) return;
    if (event.defaultPrevented || event.touches.length !== 1) { clear(); return; }
    const touch = Array.from(event.touches).find(touch => touch.identifier === current.id);
    if (!touch) { clear(); return; }
    const point = sample(touch);
    current.latest = point;
    if (current.mode === 'pending') {
      const direction = flipDirection(current.start, point);
      navigation.update();
      const available = direction === 'advance' ? state.canAdvance : state.canReverse;
      // Decide on the FIRST move. Once native scrolling owns a gesture, never
      // attempt to steal it at release or fight its momentum with a tween.
      if (!event.cancelable || !available || !canClaimFlip(current.start, point) || Math.abs(window.scrollY - current.origin) > 2) { clear(); return; }
      current.mode = 'claimed';
      current.sign = Math.sign(point.y - current.start.y);
      timer = setTimeout(() => { if (gesture === current) drag(current); }, Math.max(0, flipLimits.duration - (point.time - current.start.time)));
    }
    if (!event.cancelable) { clear(); return; }
    event.preventDefault();
    suppressClickUntil = performance.now() + 700;
    const distance = current.sign * (point.y - current.start.y);
    current.furthest = Math.max(current.furthest, distance);
    if (current.mode === 'drag' || Math.abs(point.y - current.start.y) > flipLimits.maximum
      || point.time - current.start.time > flipLimits.duration
      || current.furthest - distance > flipLimits.reversal
      || Math.abs(point.x - current.start.x) * flipLimits.axisRatio > Math.abs(point.y - current.start.y)) drag(current);
  };
  const end = (event: TouchEvent) => {
    const current = gesture;
    if (!current) return;
    const touch = Array.from(event.changedTouches).find(touch => touch.identifier === current.id);
    if (!touch || event.touches.length || event.defaultPrevented) { clear(); return; }
    const point = sample(touch);
    current.latest = point;
    const valid = current.mode === 'claimed' && isFlip(current.start, point)
      && current.sign * (point.y - current.start.y) >= current.furthest - flipLimits.reversal;
    clear();
    if (current.mode === 'pending') return;
    if (event.cancelable) event.preventDefault();
    suppressClickUntil = performance.now() + 700;
    if (valid) navigation[flipDirection(current.start, point)]();
    else drag(current);
  };
  const click = (event: MouseEvent) => {
    if (event.detail && performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
  };
  const cancel = () => clear();
  host.addEventListener('touchstart', start, { passive: true });
  host.addEventListener('touchmove', move, { passive: false });
  host.addEventListener('touchend', end, { passive: false });
  host.addEventListener('touchcancel', cancel, { passive: true });
  host.addEventListener('click', click, true);
  window.addEventListener('wheel', cancel, { passive: true });
  window.addEventListener('keydown', cancel);
  window.addEventListener('resize', cancel);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', cancel);
  return {
    destroy() {
      clear(); unsubscribe();
      host.removeEventListener('touchstart', start);
      host.removeEventListener('touchmove', move);
      host.removeEventListener('touchend', end);
      host.removeEventListener('touchcancel', cancel);
      host.removeEventListener('click', click, true);
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('resize', cancel);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', cancel);
    },
  };
}

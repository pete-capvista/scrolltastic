import type { BeatNavigation } from '../interaction/navigation';

const interactive = 'a, button, input, textarea, select, summary, audio, video, iframe, [contenteditable], [role], [aria-haspopup]';

/** Tap/click advances; all movement and momentum remain browser-owned. */
export function attachTap(host: HTMLElement, navigation: BeatNavigation): { destroy(): void } {
  let candidate: { id: number; x: number; y: number; time: number } | undefined;
  let moving = false;
  let lastScroll = -Infinity;
  let lastY = window.scrollY;
  const unsubscribe = navigation.subscribe(state => { moving = state.moving; });
  const clear = () => { candidate = undefined; };
  const eligible = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement) || !host.contains(target) || target.isContentEditable || target.closest(interactive)) return false;
    if (window.getSelection()?.isCollapsed === false || (window.visualViewport?.scale ?? 1) !== 1) return false;
    for (let element: HTMLElement | null = target; element && element !== host; element = element.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) return false;
    }
    return true;
  };
  const down = (event: PointerEvent) => {
    clear();
    // A contact that brakes momentum/assistance is only an interruption.
    if (!event.isPrimary || event.button !== 0 || event.defaultPrevented || moving
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      || performance.now() - lastScroll < 180 || window.scrollY !== lastY || !eligible(event.target)) return;
    candidate = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
  };
  const move = (event: PointerEvent) => {
    if (candidate && event.pointerId === candidate.id && Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > 10) clear();
  };
  const up = (event: PointerEvent) => {
    const tap = candidate; clear();
    if (!tap || event.pointerId !== tap.id || !event.isPrimary || event.defaultPrevented || !eligible(event.target)
      || performance.now() - tap.time > 350 || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10) return;
    navigation.advance();
  };
  const scroll = () => {
    if (window.scrollY !== lastY) { lastScroll = performance.now(); clear(); }
    lastY = window.scrollY;
  };
  const listeners: Array<[string, EventListener]> = [
    ['pointerdown', down as EventListener], ['pointermove', move as EventListener], ['pointerup', up as EventListener],
    ['pointercancel', clear], ['scroll', scroll], ['wheel', clear], ['keydown', clear], ['resize', clear], ['blur', clear],
  ];
  for (const [name, listener] of listeners) window.addEventListener(name, listener, { passive: true });
  document.addEventListener('visibilitychange', clear);
  return { destroy() {
    clear(); unsubscribe();
    for (const [name, listener] of listeners) window.removeEventListener(name, listener);
    document.removeEventListener('visibilitychange', clear);
  } };
}

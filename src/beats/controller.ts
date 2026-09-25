import type { BeatBinding, PinBinding, ResolvedBeat } from './model';
import { elementCoordinate, orderBeats, pinDisplacement, timelineCoordinate } from './resolve';

export interface BeatIndex {
  readonly beats: readonly ResolvedBeat[];
  refresh(): void;
  destroy(): void;
}

/** Batch DOM measurements; animation code publishes ranges only after refresh. */
export function createBeatIndex(root: HTMLElement, bindings: readonly BeatBinding[], pins: readonly PinBinding[], onChange?: (beats: readonly ResolvedBeat[]) => void, viewportBottomInset: () => number = () => 0): BeatIndex {
  let beats: readonly ResolvedBeat[] = Object.freeze([]);
  let destroyed = false;
  let pending = 0;
  // Let CSS resolve rem and mobile viewport units. These zero-size probes never
  // participate in layout, reading order, pointer input or keyboard navigation.
  const probes = new Map<string, HTMLElement>();
  for (const binding of bindings) {
    if (binding.kind !== 'element' || !binding.beat.offset || binding.beat.offset === '0' || probes.has(binding.beat.offset)) continue;
    const probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;width:0;height:0;visibility:hidden;pointer-events:none;';
    probe.style.top = binding.beat.offset;
    root.append(probe);
    probes.set(binding.beat.offset, probe);
  }
  const refresh = () => {
    if (destroyed || !bindings.length) return;
    const scrollY = window.scrollY;
    const viewportHeight = Math.max(0, window.innerHeight - viewportBottomInset());
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const offsets = new Map([...probes].map(([offset, probe]) => [offset, parseFloat(getComputedStyle(probe).top)]));
    const geometry = new Map<HTMLElement, { top: number; height: number }>();
    for (const binding of bindings) {
      if (geometry.has(binding.element)) continue;
      const rect = binding.element.getBoundingClientRect();
      const pin = pins.find(pin => pin.range && pin.element.contains(binding.element));
      geometry.set(binding.element, {
        top: rect.top + scrollY - (pin?.range ? pinDisplacement(pin.range, scrollY) : 0),
        height: rect.height,
      });
    }
    const candidates: Omit<ResolvedBeat, 'order'>[] = [];
    for (const binding of bindings) {
      const { top, height } = geometry.get(binding.element)!;
      if (binding.kind === 'element') {
        candidates.push({ id: binding.beat.id, label: binding.beat.label, source: 'element', element: binding.element, fallback: false,
          scrollY: elementCoordinate(top, height, viewportHeight, binding.beat.align, offsets.get(binding.beat.offset ?? '') ?? 0) });
      } else {
        for (const beat of binding.beats) candidates.push({ id: beat.id, label: beat.label, source: 'timeline', element: binding.element,
          progress: beat.progress, fallback: !binding.range,
          scrollY: binding.range ? timelineCoordinate(binding.range, beat.progress) : elementCoordinate(top, height, viewportHeight, 'center') });
      }
    }
    const next = orderBeats(candidates, maxScroll);
    if (next.length === beats.length && next.every((beat, index) => beat.id === beats[index].id && Math.abs(beat.scrollY - beats[index].scrollY) < .01 && beat.fallback === beats[index].fallback)) return;
    beats = Object.freeze(next.map(beat => Object.freeze(beat)));
    onChange?.(beats);
    root.dispatchEvent(new CustomEvent('story:beats', { bubbles: true, detail: beats }));
  };
  const schedule = () => {
    if (destroyed || pending) return;
    pending = requestAnimationFrame(() => { pending = 0; refresh(); });
  };
  if (bindings.length) {
    root.addEventListener('story:layout', schedule);
    root.addEventListener('story:geometry', schedule);
    root.addEventListener('story:animation-refresh', schedule);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
  }
  return {
    get beats() { return beats; },
    refresh,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(pending);
      root.removeEventListener('story:layout', schedule);
      root.removeEventListener('story:geometry', schedule);
      root.removeEventListener('story:animation-refresh', schedule);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      for (const probe of probes.values()) probe.remove();
      probes.clear();
      beats = Object.freeze([]);
    },
  };
}

import type { ElementBeat } from '../model/story.generated';
import type { ScrollRange } from './model';

export function elementCoordinate(top: number, height: number, viewportHeight: number, align: ElementBeat['align'] = 'start', offset = 0): number {
  const factor = align === 'center' ? .5 : align === 'end' ? 1 : 0;
  return top + (height - viewportHeight) * factor + offset;
}

export function timelineCoordinate(range: ScrollRange, progress: number): number {
  return range.start + (range.end - range.start) * progress;
}

/** Correct the visual displacement applied to a pinned story prefix. */
export function pinDisplacement(range: ScrollRange, scrollY: number): number {
  return Math.max(0, Math.min(scrollY - range.start, range.end - range.start));
}

export function orderBeats<T extends { scrollY: number }>(beats: readonly T[], maxScroll: number): Array<T & { order: number }> {
  return beats.map((beat, order) => ({ ...beat, order, scrollY: Math.max(0, Math.min(maxScroll, beat.scrollY)) }))
    .sort((a, b) => a.scrollY - b.scrollY || a.order - b.order)
    .map((beat, order) => ({ ...beat, order }));
}

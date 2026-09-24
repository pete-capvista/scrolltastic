import type { ElementBeat, TimelineBeat } from '../model/story.generated';

/** Animation-layer bridge: document coordinates, with no GSAP dependency. */
export interface ScrollRange { start: number; end: number }
export interface PinBinding { element: HTMLElement; range?: ScrollRange }
export interface ElementBeatBinding {
  kind: 'element';
  element: HTMLElement;
  beat: ElementBeat;
}
export interface TimelineBeatBinding {
  kind: 'timeline';
  element: HTMLElement;
  beats: readonly TimelineBeat[];
  range?: ScrollRange;
}
export type BeatBinding = ElementBeatBinding | TimelineBeatBinding;
export type ResolvedBeat = Readonly<{
  id: string;
  source: 'element' | 'timeline';
  scrollY: number;
  order: number;
  element: HTMLElement;
  /** True when an unavailable timeline resolves to its owning Frame's center. */
  fallback: boolean;
  progress?: number;
}>;

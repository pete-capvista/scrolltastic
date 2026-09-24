export type Direction = 'advance' | 'reverse';
export interface Destination { id: string; scrollY: number }
export interface NavigationState { canAdvance: boolean; canReverse: boolean; moving: boolean; destinationId?: string }
export interface ScrollDriver {
  move(destination: () => number | undefined, complete: () => void): () => void;
}
export interface NavigationOptions {
  readBeats(): readonly Destination[];
  readScrollY(): number;
  driver: ScrollDriver;
}
export interface BeatNavigation {
  advance(): void;
  reverse(): void;
  snap(): void;
  cancel(): void;
  update(): void;
  subscribe(listener: (state: NavigationState) => void): () => void;
  destroy(): void;
}

// Browser scrolling rounds fractional coordinates. Coincident/nearby moments
// remain separate authored Beats but need only one physical navigation move.
export const destinationTolerance = 2;
export function findDestination(beats: readonly Destination[], scrollY: number, direction: Direction): Destination | undefined {
  return direction === 'advance'
    ? beats.find(beat => beat.scrollY > scrollY + destinationTolerance)
    : [...beats].reverse().find(beat => beat.scrollY < scrollY - destinationTolerance);
}

/** Nearest reachable Beat; ties retain index order. */
export function findNearestDestination(beats: readonly Destination[], scrollY: number): Destination | undefined {
  return beats.reduce<Destination | undefined>((nearest, beat) =>
    !nearest || Math.abs(beat.scrollY - scrollY) < Math.abs(nearest.scrollY - scrollY) ? beat : nearest, undefined);
}

/** Input-independent actions; destinations are tracked by ID during a move. */
export function createBeatNavigation(options: NavigationOptions): BeatNavigation {
  const listeners = new Set<(state: NavigationState) => void>();
  let active: { id: string; direction: Direction | 'snap' } | undefined;
  let stop: (() => void) | undefined;
  let destroyed = false;
  const state = (): NavigationState => {
    const beats = options.readBeats();
    const y = options.readScrollY();
    return { canAdvance: !!findDestination(beats, y, 'advance'), canReverse: !!findDestination(beats, y, 'reverse'), moving: !!active, destinationId: active?.id };
  };
  const publish = () => {
    if (destroyed) return;
    const next = state();
    for (const listener of listeners) listener(next);
  };
  const cancel = () => {
    stop?.(); stop = undefined; active = undefined;
    publish();
  };
  const move = (direction: Direction | 'snap') => {
    if (destroyed || active?.direction === direction) return;
    cancel();
    const y = options.readScrollY();
    const destination = direction === 'snap'
      ? findNearestDestination(options.readBeats(), y)
      : findDestination(options.readBeats(), y, direction);
    if (!destination || Math.abs(destination.scrollY - y) <= destinationTolerance) return;
    const request = { id: destination.id, direction };
    active = request;
    publish();
    const cancelMove = options.driver.move(
      () => options.readBeats().find(beat => beat.id === request.id)?.scrollY,
      () => {
        if (active !== request || destroyed) return;
        stop = undefined; active = undefined; publish();
      },
    );
    // Drivers may finish synchronously (e.g. reduced motion).
    if (active === request) stop = cancelMove;
    else cancelMove();
  };
  return {
    advance: () => move('advance'), reverse: () => move('reverse'),
    snap: () => { if (!active) move('snap'); }, cancel,
    update() {
      if (active && !options.readBeats().some(beat => beat.id === active!.id)) cancel();
      else publish();
    },
    subscribe(listener) { listeners.add(listener); listener(state()); return () => { listeners.delete(listener); }; },
    destroy() { destroyed = true; stop?.(); stop = undefined; active = undefined; listeners.clear(); },
  };
}

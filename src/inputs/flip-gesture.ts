import type { Direction } from '../interaction/navigation';

export interface TouchSample { x: number; y: number; time: number }
export const flipLimits = { claimTime: 140, duration: 240, minimum: 24, maximum: 140, speed: .35, axisRatio: 2, reversal: 12 } as const;

/** Finger movement follows native scrolling: up advances down the document. */
export function flipDirection(start: TouchSample, point: TouchSample): Direction {
  return point.y < start.y ? 'advance' : 'reverse';
}
export function canClaimFlip(start: TouchSample, point: TouchSample): boolean {
  const elapsed = point.time - start.time;
  const distance = Math.abs(point.y - start.y);
  return elapsed > 0 && elapsed <= flipLimits.claimTime && distance >= 12 && distance <= flipLimits.maximum
    && distance >= Math.abs(point.x - start.x) * flipLimits.axisRatio && distance / elapsed >= flipLimits.speed;
}
export function isFlip(start: TouchSample, point: TouchSample): boolean {
  const elapsed = point.time - start.time;
  const distance = Math.abs(point.y - start.y);
  return elapsed > 0 && elapsed <= flipLimits.duration && distance >= flipLimits.minimum && distance <= flipLimits.maximum
    && distance >= Math.abs(point.x - start.x) * flipLimits.axisRatio && distance / elapsed >= flipLimits.speed;
}

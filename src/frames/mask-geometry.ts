import type { MaskShape } from '../model/story.generated';

const pointCount = 24;
type Point = [number, number];

function resample(polygon: Point[]): Point[] {
  const lengths = polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return Math.hypot(next[0] - point[0], next[1] - point[1]);
  });
  const perimeter = lengths.reduce((sum, length) => sum + length, 0);
  return Array.from({ length: pointCount }, (_, index) => {
    let distance = perimeter * index / pointCount;
    for (let segment = 0; segment < polygon.length; segment++) {
      if (distance <= lengths[segment] || segment === polygon.length - 1) {
        const amount = lengths[segment] ? distance / lengths[segment] : 0;
        const start = polygon[segment];
        const end = polygon[(segment + 1) % polygon.length];
        return [start[0] + (end[0] - start[0]) * amount, start[1] + (end[1] - start[1]) * amount];
      }
      distance -= lengths[segment];
    }
    return [50, 50];
  });
}

function roundedRect(): Point[] {
  const radius = 0.14;
  const corners: Array<[number, number, number]> = [
    [radius, radius, 180], [1 - radius, radius, 270],
    [1 - radius, 1 - radius, 0], [radius, 1 - radius, 90],
  ];
  const points: Point[] = [];
  for (const [cx, cy, start] of corners) {
    for (let step = 0; step < 6; step++) {
      const angle = (start + step * 90 / 5) * Math.PI / 180;
      points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    }
  }
  return points;
}

export function maskClipPath(shape: MaskShape, fullPanel = false): string {
  const source: Point[] = fullPanel
    ? [[0, 0], [1, 0], [1, 1], [0, 1]]
    : shape.type === 'ellipse'
      ? Array.from({ length: pointCount }, (_, index) => {
          const angle = 2 * Math.PI * index / pointCount;
          return [0.5 + 0.5 * Math.cos(angle), 0.5 + 0.5 * Math.sin(angle)];
        })
      : shape.type === 'rounded-rect'
        ? roundedRect()
        : shape.points.map(([x, y]) => [x, y]);
  const points = source.length === pointCount && shape.type !== 'polygon' && !fullPanel ? source : resample(source);
  return `polygon(${points.map(([x, y]) => `${(x * 100).toFixed(4)}% ${(y * 100).toFixed(4)}%`).join(', ')})`;
}

import type { NormalizedFrame, NormalizedPanel } from '../parser/parse';

const anchors = {
  'top-left': [0, 0], top: [50, 0], 'top-right': [100, 0],
  left: [0, 50], center: [50, 50], right: [100, 50],
  'bottom-left': [0, 100], bottom: [50, 100], 'bottom-right': [100, 100],
} as const;

export function applyPanelHeight(panel: HTMLElement, height: NormalizedPanel['height']) {
  if (height.mode === 'viewport') panel.style.height = `${(height.value ?? 1) * 100}svh`;
  if (height.mode === 'fixed') panel.style.height = height.value;
}

export function placeFrame(slot: HTMLElement, placement: HTMLElement, frame: NormalizedFrame) {
  const position = frame.position;
  slot.style.zIndex = String(position?.z ?? (frame.type === 'background' ? 0 : frame.flow === 'normal' ? 1 : frame.flow === 'overlay' ? 10 : 20));
  if (frame.type === 'background') return;
  placement.style.width = position?.width ?? '100%';
  placement.style.height = position?.height ?? 'auto';
  if (frame.flow === 'normal') return;
  const [x, y] = anchors[position!.anchor];
  placement.style.left = `calc(${x}% + ${position?.x ?? '0px'})`;
  placement.style.top = `calc(${y}% + ${position?.y ?? '0px'})`;
  placement.style.transform = `translate(${-x}%, ${-y}%)`;
}

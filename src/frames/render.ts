import type { NormalizedFrame } from '../parser/parse';
import { resolveAsset } from '../assets/resolve';
import { placeFrame } from '../layout/position';

export function renderFrame(frame: NormalizedFrame, assetBaseUrl: string): HTMLElement {
  // Each slot stays in authored DOM order; its flow controls layout and clipping.
  const slot = document.createElement('div');
  slot.className = `frame-slot frame-slot--${frame.flow}`;
  slot.dataset.frameType = frame.type;
  slot.dataset.flow = frame.flow;
  if (frame.id) slot.dataset.frameId = frame.id;
  const placement = document.createElement('div');
  placement.className = 'frame-placement';
  const content = document.createElement('div');
  content.className = `frame-content frame-content--${frame.type}`;
  if (frame.type === 'image' || frame.type === 'background') {
    const img = document.createElement('img');
    img.src = resolveAsset(frame.asset, assetBaseUrl);
    img.alt = frame.type === 'image' ? frame.alt : '';
    img.decoding = 'async';
    img.loading = frame.flow === 'normal' ? 'lazy' : 'eager';
    img.style.objectFit = frame.fit === 'cover' || (frame.type === 'background' && !frame.fit) ? 'cover' : 'contain';
    if (frame.type === 'image') {
      content.style.aspectRatio = String(frame.aspectRatio);
      // Pixel dimensions need not be known to reserve the authored ratio.
      img.style.aspectRatio = String(frame.aspectRatio);
    } else {
      slot.classList.add('frame-slot--background');
      slot.setAttribute('aria-hidden', 'true');
    }
    content.append(img);
  } else {
    const text = document.createElement('p');
    text.textContent = frame.text;
    content.append(text);
  }
  placement.append(content);
  slot.append(placement);
  placeFrame(slot, placement, frame);
  return slot;
}

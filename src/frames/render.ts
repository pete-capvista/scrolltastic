import type { NormalizedFrame } from '../parser/parse';
import { resolveAsset } from '../assets/resolve';
import { placeFrame } from '../layout/position';
import { applyTextEnvironment } from '../typography/apply';
import { maskClipPath } from './mask-geometry';

export function renderFrame(frame: NormalizedFrame, assetBaseUrl: string): HTMLElement {
  // Each slot stays in authored DOM order; its flow controls layout and clipping.
  const slot = document.createElement('div');
  slot.className = `frame-slot frame-slot--${frame.flow}`;
  slot.dataset.frameType = frame.type;
  slot.dataset.flow = frame.flow;
  applyTextEnvironment(slot, frame);
  if (frame.id) slot.dataset.frameId = frame.id;
  const placement = document.createElement('div');
  placement.className = 'frame-placement';
  const content = document.createElement('div');
  content.className = `frame-content frame-content--${frame.type}`;
  if (frame.type === 'image' || frame.type === 'background' || frame.type === 'mask') {
    const img = document.createElement('img');
    img.src = resolveAsset(frame.type === 'mask' ? frame.content.src : frame.src, assetBaseUrl);
    const media = frame.type === 'background' ? {} : frame.type === 'mask' ? frame.content : frame;
    describeImage(img, media, frame.type === 'background');
    img.decoding = 'async';
    img.loading = frame.flow === 'normal' ? 'lazy' : 'eager';
    const fit = frame.type === 'mask' ? frame.content.fit : frame.fit;
    img.style.objectFit = fit ?? (frame.type === 'background' || frame.type === 'mask' ? 'cover' : 'contain');
    if (frame.type === 'image') {
      content.style.aspectRatio = String(frame.aspectRatio ?? 1);
      // Pixel dimensions need not be known to reserve the authored ratio.
      if (frame.aspectRatio) img.style.aspectRatio = String(frame.aspectRatio);
      else content.dataset.intrinsic = 'true';
    } else if (frame.type === 'background') {
      slot.classList.add('frame-slot--background');
      slot.setAttribute('aria-hidden', 'true');
    } else {
      const focus = frame.content.focus ?? { x: 0.5, y: 0.5 };
      slot.classList.add('frame-slot--mask');
      content.style.clipPath = maskClipPath(frame.shape);
      img.style.objectPosition = `${focus.x * 100}% ${focus.y * 100}%`;
    }
    content.append(img);
  } else if (frame.type === 'card') {
    const img = document.createElement('img');
    img.src = resolveAsset(frame.src, assetBaseUrl);
    describeImage(img, frame);
    img.decoding = 'async';
    img.loading = frame.flow === 'normal' ? 'lazy' : 'eager';
    img.style.objectFit = 'contain';
    content.style.aspectRatio = String(frame.aspectRatio ?? 1);
    if (!frame.aspectRatio) content.dataset.intrinsic = 'true';
    if (frame.cardGeometry) {
      content.dataset.artWindowX = String(frame.cardGeometry.artWindow.x);
      content.dataset.artWindowY = String(frame.cardGeometry.artWindow.y);
      content.dataset.artWindowWidth = String(frame.cardGeometry.artWindow.width);
      content.dataset.artWindowHeight = String(frame.cardGeometry.artWindow.height);
    }
    slot.classList.add('frame-slot--card');
    content.append(img);
    if (frame.artwork?.transition) {
      const mask = document.createElement('div');
      mask.className = 'card-art-mask';
      const source = document.createElement('img');
      source.className = 'card-art-source';
      source.src = resolveAsset(frame.src, assetBaseUrl);
      source.alt = '';
      source.decoding = 'async';
      source.loading = 'eager';
      mask.append(source);
      slot.append(mask);
    }
  } else {
    const text = document.createElement('p');
    if (frame.type === 'dialogue' && frame.speaker) {
      const speaker = document.createElement('bdi');
      speaker.className = 'dialogue-speaker';
      speaker.textContent = frame.speaker;
      text.append(speaker, ': ');
    }
    text.append(document.createTextNode(frame.text));
    content.append(text);
  }
  placement.append(content);
  slot.append(placement);
  placeFrame(slot, placement, frame);
  return slot;
}

function describeImage(img: HTMLImageElement, media: { alt?: string; decorative?: boolean }, background = false): void {
  const decorative = background || media.decorative === true;
  img.alt = decorative ? '' : media.alt?.trim() || 'Image description unavailable';
  if (decorative) img.setAttribute('aria-hidden', 'true');
}

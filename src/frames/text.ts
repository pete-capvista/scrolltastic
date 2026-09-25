import type { NormalizedFrame } from '../model/normalized';

type Narrative = Extract<NormalizedFrame, { type: 'narrative' }>;
type Dialogue = Extract<NormalizedFrame, { type: 'dialogue' }>;
type SoundEffect = Extract<NormalizedFrame, { type: 'sound-effect' }>;

function paragraph(text: string): HTMLParagraphElement {
  const element = document.createElement('p');
  element.textContent = text;
  return element;
}

export function renderNarrative(frame: Narrative, content: HTMLElement): void {
  content.dataset.shape = frame.shape ?? 'rectangle';
  content.append(paragraph(frame.text));
}

export function renderDialogue(frame: Dialogue, slot: HTMLElement, content: HTMLElement): void {
  const style = frame.dialogueStyle ?? 'spoken';
  const shape = frame.bubble?.shape ?? (style === 'thought' ? 'cloud' : 'oval');
  content.dataset.dialogueStyle = style;
  content.dataset.shape = shape;
  if (frame.tail?.enabled !== false) {
    content.dataset.tailDirection = frame.tail?.direction ?? 'bottom';
    content.dataset.tailStyle = frame.tail?.style ?? (style === 'thought' ? 'circle-chain' : 'triangle');
  }
  if (frame.chain) slot.dataset.chainConnector = frame.chain.connector ?? 'bridge';

  const text = document.createElement('p');
  if (frame.speaker) {
    const speaker = document.createElement('bdi');
    speaker.className = 'dialogue-speaker';
    speaker.textContent = frame.speaker;
    text.append(speaker, ': ');
  }
  text.append(document.createTextNode(frame.text));
  content.append(text);
}

export function renderSoundEffect(frame: SoundEffect, content: HTMLElement): void {
  content.dataset.soundStyle = frame.style ?? 'impact';
  content.append(paragraph(frame.text));
}

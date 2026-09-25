import type { Typography } from '../model/story.generated';

// Renderer-owned system stacks need no external font requests or bundled licenses.
export const fonts = {
  'story-sans': 'system-ui, sans-serif',
  'story-serif': "Georgia, 'Times New Roman', serif",
  comic: "'Comic Sans MS', 'Chalkboard SE', system-ui, sans-serif",
  handwritten: "'Segoe Print', 'Bradley Hand', cursive",
  dramatic: "Impact, 'Arial Black', system-ui, sans-serif",
  technical: 'ui-monospace, monospace',
} as const;
const sizes = { small: '1rem', medium: 'clamp(1rem, 3.9vw, 1.3rem)', large: 'clamp(1.25rem, 4.8vw, 1.65rem)', 'x-large': 'clamp(1.5rem, 6vw, 2rem)' };
export interface TextEnvironment { language?: string; direction?: 'ltr' | 'rtl' | 'auto'; typography?: Typography; color?: string }
export function applyTextEnvironment(element: HTMLElement, config: TextEnvironment): void {
  if (config.language) element.lang = config.language;
  if (config.direction) element.dir = config.direction;
  if (config.color) element.style.setProperty('--story-color', config.color);
  const t = config.typography;
  if (!t) return;
  const values = {
    font: t.font && fonts[t.font], size: t.size && sizes[t.size], weight: t.weight,
    style: t.style, align: t.align,
    leading: t.lineHeight && { compact: '1.25', normal: '1.5', relaxed: '1.8' }[t.lineHeight],
    tracking: t.letterSpacing && { normal: 'normal', wide: '.05em' }[t.letterSpacing],
  };
  for (const [key, value] of Object.entries(values)) if (value) element.style.setProperty(`--story-${key}`, value);
}

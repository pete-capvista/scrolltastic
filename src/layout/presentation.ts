import type { Panel } from '../model/story.generated';

export const spacing = { none: '0px', small: '.5rem', medium: '1rem', large: '2rem' };
export function applyPanelPresentation(panel: HTMLElement, config: Omit<Panel, 'frames'>): void {
  panel.dataset.overflow = config.overflow ?? 'hidden';
  if (config.background) panel.style.backgroundColor = config.background;
  if (config.opacity !== undefined) panel.style.opacity = String(config.opacity);
  if (config.padding) panel.style.padding = spacing[config.padding];
  if (config.gap) panel.style.setProperty('--panel-gap', spacing[config.gap]);
  if (config.radius) panel.style.setProperty('--panel-radius', spacing[config.radius]);
  if (config.border) {
    panel.style.border = `${{ thin: 1, medium: 2, thick: 4 }[config.border.width ?? 'thin']}px solid ${config.border.color}`;
  }
  if (config.align) panel.dataset.align = config.align;
}

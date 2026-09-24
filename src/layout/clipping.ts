// Exact-height Panels may contain taller normal-flow content. Clip each
// semantic Frame independently so overflow siblings keep their permissions.
export function updateNormalClipping(root: HTMLElement) {
  const writes: { element: HTMLElement; clip: string }[] = [];
  for (const panel of root.querySelectorAll<HTMLElement>('.story-panel')) {
    const bounds = panel.getBoundingClientRect();
    for (const element of panel.querySelectorAll<HTMLElement>(':scope > .frame-slot--normal')) {
      const box = element.getBoundingClientRect();
      const edges = [bounds.top - box.top, box.right - bounds.right, box.bottom - bounds.bottom, bounds.left - box.left];
      writes.push({ element, clip: `inset(${edges.map(edge => `${Math.max(0, edge)}px`).join(' ')})` });
    }
  }
  for (const { element, clip } of writes) {
    if (element.style.clipPath !== clip) element.style.clipPath = clip;
  }
}

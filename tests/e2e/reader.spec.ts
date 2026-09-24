import { test, expect, type Page } from '@playwright/test';

const ridge = '550e8400-e29b-41d4-a716-446655440000';
const coast = 'b670153e-79da-4bb4-9d69-1b8efb433287';
async function openStory(page: Page, id = ridge) {
  await page.goto(`/s/${id}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
}
const panel = (page: Page, id: string) => page.locator(`[data-panel-id="${id}"]`);
const frame = (page: Page, id: string) => page.locator(`[data-frame-id="${id}"]`);

test('direct links, refresh, and isolated package assets', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  await openStory(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The light beyond the ridge');
  await expect(frame(page, 'ridge-image').locator('img')).toHaveAttribute('src', new RegExp(`/stories/${ridge}/assets/scene.svg$`));
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await openStory(page, coast);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Where the tide turns');
  await expect(frame(page, 'coast-image').locator('img')).toHaveAttribute('src', new RegExp(`/stories/${coast}/assets/scene.svg$`));
  const a = await request.get(`/stories/${ridge}/assets/scene.svg`);
  const b = await request.get(`/stories/${coast}/assets/scene.svg`);
  expect(await a.text()).not.toBe(await b.text());
  expect(errors).toEqual([]);
});

test('intrinsic heights, Space, overflow, clipping and uninterrupted image joins', async ({ page }) => {
  await openStory(page);
  const arrival = (await panel(page, 'arrival').boundingBox())!;
  expect(arrival.height).toBeCloseTo(arrival.width / .8, 0);
  const observatory = (await panel(page, 'observatory').boundingBox())!;
  expect(observatory.height).toBeCloseTo(observatory.width * .75, 0);
  const gap = (await page.locator('.story-space').first().boundingBox())!;
  expect(gap.height).toBeCloseTo(page.viewportSize()!.height * .24, 0);
  const dialogue = (await frame(page, 'question').locator('.frame-placement').boundingBox())!;
  expect(dialogue.y).toBeLessThan(observatory.y);
  const bridge = (await frame(page, 'bridge').locator('.frame-placement').boundingBox())!;
  expect(bridge.y + bridge.height).toBeGreaterThan(observatory.y + observatory.height);
  await frame(page, 'bridge').locator('.frame-placement').scrollIntoViewIfNeeded();
  // Hit testing establishes that the overflow is painted above the following Space.
  const visibleAcrossBoundary = await frame(page, 'bridge').locator('.frame-placement').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const point = { x: rect.x + rect.width / 2, y: rect.bottom - 2 };
    (element as HTMLElement).style.pointerEvents = 'auto';
    const hit = document.elementFromPoint(point.x, point.y);
    (element as HTMLElement).style.pointerEvents = '';
    return hit !== null && element.contains(hit);
  });
  expect(visibleAcrossBoundary).toBe(true);
  expect(await frame(page, 'opening').evaluate(el => getComputedStyle(el).clipPath)).toBe('inset(0px)');
  const top = (await panel(page, 'passage-start').boundingBox())!;
  const bottom = (await panel(page, 'passage-end').boundingBox())!;
  expect(bottom.y).toBeCloseTo(top.y + top.height, 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('authored reading order is preserved across flow modes', async ({ page }) => {
  await openStory(page);
  const order = await panel(page, 'observatory').locator('[data-frame-id]').evaluateAll(elements => elements.map(el => el.getAttribute('data-frame-id')));
  expect(order).toEqual(['question', 'observatory-image', 'bridge']);
  const semantics = await panel(page, 'observatory').ariaSnapshot();
  expect(semantics.indexOf('Did you see it too?')).toBeLessThan(semantics.indexOf('An open, glowing doorway'));
  expect(semantics.indexOf('An open, glowing doorway')).toBeLessThan(semantics.indexOf('The door had been closed'));
});

test('resizes and reduced motion preserve exact and natural heights with native scroll', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openStory(page);
  await page.setViewportSize({ width: 844, height: 390 });
  const imagePanel = (await panel(page, 'arrival').boundingBox())!;
  expect(imagePanel.height).toBeCloseTo(imagePanel.width / .8, 0);
  expect((await panel(page, 'signal').boundingBox())!.height).toBeCloseTo(390 * .7, 0);
  await page.evaluate(() => scrollTo(0, 700));
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await openStory(page, coast);
  expect((await panel(page, 'horizon').boundingBox())!.height).toBeCloseTo(420, 0);
});

test('missing stories and assets never become HTML configuration', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading')).toHaveText('Every story starts with a link.');
  await page.goto('/s/not-a-story');
  await expect(page.getByRole('heading')).toHaveText('Story not found');
  await page.goto('/s/550e8400-e29b-41d4-a716-446655440099');
  await expect(page.getByRole('heading')).toHaveText('Story unavailable');
  for (const path of [`/stories/${ridge}/missing.json`, `/stories/${ridge}/assets/missing.svg`, '/api/missing']) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('<main id="app"');
  }
});

test('failed images retain geometry and alt text', async ({ page }) => {
  await page.route(`**/stories/${ridge}/assets/scene.svg`, route => route.abort());
  await openStory(page);
  const img = frame(page, 'ridge-image').locator('img');
  await expect(img).toHaveAttribute('data-asset-state', 'error');
  await expect(img).toHaveAttribute('alt', /Moonlight/);
  const box = (await panel(page, 'arrival').boundingBox())!;
  expect(box.height).toBeCloseTo(box.width / .8, 0);
});

test('a slow obsolete route cannot replace the new story', async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/stories/${ridge}/story.json`, async route => {
    await delayed;
    await route.continue().catch(() => {});
  });
  await page.goto(`/s/${ridge}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(id => {
    history.pushState(null, '', `/s/${id}`);
    dispatchEvent(new PopStateEvent('popstate'));
  }, coast);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  release();
  await expect(page.getByRole('heading')).toHaveText('Where the tide turns');
  await expect(page.locator('.story-body')).toHaveCount(1);
});

test('mount lifecycle cleans up and plain text is never interpreted as HTML', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const moduleUrl = '/src/renderer/mount.ts';
    const { mountStory } = await import(/* @vite-ignore */ moduleUrl);
    const root = document.createElement('div');
    document.body.append(root);
    const doc = { version: '0.1', body: { id: '550e8400-e29b-41d4-a716-446655440000', title: 'Test', containers: [{ type: 'container', id: 'container', flow: [{ type: 'panel', id: 'panel', frames: [{ type: 'narrative', text: '<img src=x onerror=alert(1)>' }] }] }] } };
    let calls = 0;
    const opts = { assetBaseUrl: `${location.origin}/stories/test/`, onLayout: () => { calls++; } };
    const first = mountStory(root, doc, opts);
    await first.ready;
    const literal = root.textContent!.includes('<img src=x onerror=alert(1)>') && root.querySelector('img') === null;
    const second = mountStory(root, doc, opts);
    await second.ready;
    first.destroy();
    const count = root.querySelectorAll('.story-body').length;
    second.destroy();
    const stoppedAt = calls;
    dispatchEvent(new Event('resize'));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const cleaned = root.children.length === 0 && calls === stoppedAt && second.elements.size === 0;
    const cancelled = mountStory(root, doc, opts);
    cancelled.destroy();
    await cancelled.ready;
    root.remove();
    return { literal, count, cleaned };
  });
  expect(result).toEqual({ literal: true, count: 1, cleaned: true });
});

test('exact height clips normal artwork while overflow paints across the next Panel', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async id => {
    const moduleUrl = '/src/renderer/mount.ts';
    const { mountStory } = await import(/* @vite-ignore */ moduleUrl);
    const root = document.createElement('div');
    root.style.width = '320px';
    document.body.prepend(root);
    const doc = { version: '0.1', body: { id, title: 'Clipping', containers: [{ type: 'container', id: 'container', flow: [
      { type: 'panel', id: 'first', height: { mode: 'fixed', value: '100px' }, frames: [
        { type: 'image', id: 'tall', asset: 'assets/scene.svg', alt: 'Tall artwork', aspectRatio: .5 },
        { type: 'narrative', id: 'crossing', text: 'Bridge', flow: 'overflow', position: { anchor: 'top-left', y: '80%', width: '60%' } },
      ] },
      { type: 'panel', id: 'second', frames: [{ type: 'narrative', text: 'Following Panel' }] },
    ] }] } };
    const handle = mountStory(root, doc, { assetBaseUrl: `${location.origin}/stories/${id}/` });
    await handle.ready;
    const first = root.querySelector<HTMLElement>('[data-panel-id=first]')!;
    const normal = root.querySelector<HTMLElement>('[data-frame-id=tall]')!;
    const crossing = root.querySelector<HTMLElement>('[data-frame-id=crossing] .frame-placement')!;
    crossing.scrollIntoView({ block: 'center' });
    crossing.style.pointerEvents = 'auto';
    const box = crossing.getBoundingClientRect();
    const firstBox = first.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + 40, firstBox.bottom + 5);
    const output = {
      height: firstBox.height,
      naturalHeight: normal.getBoundingClientRect().height,
      clip: getComputedStyle(normal).clipPath,
      offset: box.top - firstBox.top,
      crossingVisible: hit !== null && crossing.contains(hit),
    };
    handle.destroy(); root.remove();
    return output;
  }, ridge);
  expect(result.height).toBe(100);
  expect(result.naturalHeight).toBe(640);
  expect(result.clip).toBe('inset(0px 0px 540px)');
  expect(result.offset).toBe(80);
  expect(result.crossingVisible).toBe(true);
});

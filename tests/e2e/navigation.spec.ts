import { test, expect, type Page } from '@playwright/test';

const ridge = '550e8400-e29b-41d4-a716-446655440000';
const cards = 'c6c6bfa1-145e-4d68-a2fd-cc94107b46ea';
const coast = 'b670153e-79da-4bb4-9d69-1b8efb433287';
interface Moment { id: string; scrollY: number; fallback: boolean }
declare global { interface Window { navigationBeats: Moment[] } }
const controls = (page: Page) => page.getByRole('navigation', { name: 'Story navigation' });
const next = (page: Page) => controls(page).getByRole('button', { name: 'Next', exact: true });
const previous = (page: Page) => controls(page).getByRole('button', { name: 'Previous', exact: true });
// These cases isolate explicit navigation; scroll-snap.spec.ts covers settling.
test.beforeEach(async ({ page }) => {
  await page.route(`**/stories/${ridge}/story.json`, async route => {
    const response = await route.fetch(); const story = await response.json();
    delete story.body.interaction.scroll;
    story.body.interaction.advance.inputs = ['controls', 'keyboard'];
    await route.fulfill({ response, json: story });
  });
});
async function open(page: Page, id = ridge) {
  await page.addInitScript(() => {
    window.navigationBeats = [];
    document.addEventListener('story:beats', event => {
      window.navigationBeats = (event as CustomEvent).detail.map(({ id, scrollY, fallback }: Moment) => ({ id, scrollY, fallback }));
    });
  });
  await page.goto(`/s/${id}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(controls(page)).toBeVisible();
  await page.waitForTimeout(250);
}
async function destination(page: Page, direction = 'advance') {
  return page.evaluate(direction => {
    const values = direction === 'advance' ? window.navigationBeats : [...window.navigationBeats].reverse();
    return values.find(beat => direction === 'advance' ? beat.scrollY > scrollY + 2 : beat.scrollY < scrollY - 2);
  }, direction);
}
async function landed(page: Page, id: string) {
  await expect(controls(page)).toHaveAttribute('data-moving', 'false');
  await expect.poll(() => page.evaluate(id => Math.abs(scrollY - window.navigationBeats.find(beat => beat.id === id)!.scrollY), id)).toBeLessThanOrEqual(2);
}

test('Next and Previous navigate from native scroll position and preserve button focus', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await expect(previous(page)).toHaveAttribute('aria-disabled', 'true');
  const first = (await destination(page))!;
  await next(page).click(); await landed(page, first.id);
  await expect(next(page)).toBeFocused();
  const second = (await destination(page))!;
  await next(page).click(); await landed(page, second.id);
  const reverse = (await destination(page, 'reverse'))!;
  await previous(page).click(); await landed(page, reverse.id);
  await expect(previous(page)).toBeFocused();
  // Native scrolling changes the next action's origin, rather than retaining a
  // stale "last visited" Beat in the controller.
  await page.evaluate(() => scrollTo(0, 1800));
  await page.waitForTimeout(100);
  const manualNext = (await destination(page))!;
  await next(page).click(); await landed(page, manualNext.id);
  expect(errors).toEqual([]);
});

test('the pinned Card sequence reaches hold and artwork with reversible actions', async ({ page }) => {
  await open(page, cards);
  for (const id of ['lunora-arrival', 'lunora-card-hold', 'lunora-return-art']) {
    expect((await destination(page))?.id).toBe(id);
    await next(page).click(); await landed(page, id);
  }
  await expect(page.locator('[data-frame-id="lunora-card"] .frame-content img')).toHaveCSS('opacity', '0');
  await previous(page).click(); await landed(page, 'lunora-card-hold');
  await expect(page.locator('[data-frame-id="lunora-card"] .frame-content img')).toHaveCSS('opacity', '1');
});

test('reduced motion traverses the extended ridge, skips coincident Beats and keeps ending text above controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const visited: string[] = [];
  for (let count = 0; count < 25; count++) {
    const target = await destination(page);
    if (!target) break;
    visited.push(target.id);
    await next(page).click(); await landed(page, target.id);
  }
  expect(visited).toContain('chamber-arrival');
  expect(visited).toContain('homeward-view');
  expect(visited.at(-1)).toBe('ridge-ending');
  await expect(next(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(next(page)).toBeFocused();
  const geometry = await page.evaluate(() => ({
    ending: document.querySelector('[data-panel-id="ending"]')!.getBoundingClientRect().bottom,
    controls: document.querySelector('.reader-controls')!.getBoundingClientRect().top,
  }));
  expect(geometry.ending).toBeLessThanOrEqual(geometry.controls + 2);
  const last = await page.evaluate(() => scrollY);
  await next(page).dispatchEvent('click');
  expect(await page.evaluate(() => scrollY)).toBe(last);
  const back = (await destination(page, 'reverse'))!;
  await previous(page).click(); await landed(page, back.id);
});

for (const input of ['wheel', 'touch', 'keyboard']) test(`${input} interrupts assistance without blocking subsequent manual scrolling`, async ({ page }) => {
  await open(page);
  // Start just before a long move so an interruption is observable.
  await page.evaluate(() => scrollTo(0, 150));
  await page.waitForTimeout(100);
  await next(page).click();
  await expect(controls(page)).toHaveAttribute('data-moving', 'true');
  if (input === 'wheel') await page.mouse.wheel(0, 120);
  if (input === 'touch') await page.locator('.story-body').dispatchEvent('touchstart');
  if (input === 'keyboard') await page.keyboard.press('Escape');
  await expect(controls(page)).toHaveAttribute('data-moving', 'false');
  await page.waitForTimeout(150);
  const stopped = await page.evaluate(() => scrollY);
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(stopped, 0);
  await page.evaluate(() => scrollBy(0, 50));
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(stopped);
});

test('repeated input is not queued, reverse cancels, and native buttons work by keyboard', async ({ page }) => {
  await open(page);
  const target = (await destination(page))!;
  await next(page).focus();
  await page.keyboard.press('Enter');
  await next(page).dispatchEvent('click');
  await next(page).dispatchEvent('click');
  await landed(page, target.id);
  await page.waitForTimeout(650);
  await landed(page, target.id);
  await page.keyboard.press('Space');
  await expect(controls(page)).toHaveAttribute('data-moving', 'true');
  await page.waitForTimeout(100);
  await previous(page).click();
  await expect(controls(page)).toHaveAttribute('data-moving', 'false');
  await expect(previous(page)).toBeFocused();
});

test('resize recalculates destinations and route changes remove controls and cancel motion', async ({ page }) => {
  await open(page);
  await next(page).click();
  await page.setViewportSize({ width: 600, height: 700 });
  await expect(controls(page)).toHaveAttribute('data-moving', 'false');
  await page.waitForTimeout(350);
  const target = (await destination(page))!;
  await next(page).click(); await landed(page, target.id);
  await next(page).click();
  await page.evaluate(id => { history.pushState(null, '', `/s/${id}`); dispatchEvent(new PopStateEvent('popstate')); }, coast);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(controls(page)).toHaveCount(0);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await page.locator('#app').evaluate(el => (el as HTMLElement).style.paddingBottom)).toBe('');
  await expect(page.locator('#app')).not.toHaveAttribute('tabindex');
});

test('explicitly disabled navigation renders a continuous story without controls', async ({ page }) => {
  await page.route(`**/stories/${ridge}/story.json`, async route => {
    const response = await route.fetch(); const story = await response.json();
    story.body.interaction.advance.enabled = false; delete story.body.interaction.scroll;
    await route.fulfill({ response, json: story });
  });
  await page.goto(`/s/${ridge}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(controls(page)).toHaveCount(0);
  await page.evaluate(() => scrollTo(0, 500));
  expect(await page.evaluate(() => scrollY)).toBe(500);
});

for (const id of [ridge, cards]) test(`scoped arrows advance and reverse with stable focus in ${id}`, async ({ page }) => {
  await open(page, id);
  const host = page.locator('#app');
  await page.keyboard.press('Tab');
  await expect(host).toBeFocused();
  const target = (await destination(page))!;
  await page.keyboard.press('ArrowDown');
  await landed(page, target.id);
  await expect(host).toBeFocused();
  await next(page).focus();
  const onward = (await destination(page))!;
  await page.keyboard.press('ArrowDown');
  await landed(page, onward.id);
  const back = (await destination(page, 'reverse'))!;
  await page.keyboard.press('ArrowUp');
  await landed(page, back.id);
  await expect(next(page)).toBeFocused();
  await expect(next(page)).toHaveAttribute('aria-keyshortcuts', 'ArrowDown');
});

test('keyboard repeats do not queue and Escape interrupts', async ({ page }) => {
  await open(page);
  await page.locator('#app').focus();
  const target = (await destination(page))!;
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.up('ArrowDown');
  await landed(page, target.id);
  await page.waitForTimeout(650);
  await landed(page, target.id);
  await page.keyboard.press('ArrowDown');
  await expect(controls(page)).toHaveAttribute('data-moving', 'true');
  await page.keyboard.press('Escape');
  await expect(controls(page)).toHaveAttribute('data-moving', 'false');
});

test('arrow ownership respects focus, widgets, modifiers, composition and boundaries', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const result = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('#app')!;
    const key = (target: HTMLElement, options: KeyboardEventInit = {}) => {
      target.focus({ preventScroll: true });
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true, ...options });
      target.dispatchEvent(event); return event.defaultPrevented;
    };
    const results: boolean[] = [];
    for (const markup of ['<input>', '<textarea></textarea>', '<select><option>A</option></select>', '<div contenteditable="true">Edit</div>', '<div role="slider" tabindex="0"></div>']) {
      const wrapper = document.createElement('div'); wrapper.innerHTML = markup; host.append(wrapper);
      results.push(key(wrapper.firstElementChild as HTMLElement)); wrapper.remove();
    }
    const outside = document.createElement('button'); document.body.append(outside);
    results.push(key(outside)); outside.remove();
    for (const option of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { isComposing: true }]) results.push(key(host, option));
    results.push(key(host, { key: 'ArrowUp' })); // First Beat boundary.
    const handled = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    handled.preventDefault(); host.dispatchEvent(handled);
    return { results, y: scrollY, moving: document.querySelector<HTMLElement>('.reader-controls')!.dataset.moving };
  });
  expect(result.results.every(value => !value)).toBe(true);
  expect(result.y).toBe(0);
  expect(result.moving).toBe('false');
  // A real unfocused arrow still scrolls continuously.
  await page.locator('#app').evaluate(el => (el as HTMLElement).blur());
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

test('reduced-motion keyboard navigation reaches the ending and releases the boundary', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await next(page).focus();
  for (let count = 0; count < 25; count++) {
    const target = await destination(page); if (!target) break;
    await page.keyboard.press('ArrowDown'); await landed(page, target.id);
  }
  await expect(next(page)).toHaveAttribute('aria-disabled', 'true');
  const consumed = await next(page).evaluate(el => {
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    el.dispatchEvent(event); return event.defaultPrevented;
  });
  expect(consumed).toBe(false);
  await expect(next(page)).toBeFocused();
});

test('omitted input selection remains controls-only', async ({ page }) => {
  await page.route(`**/stories/${ridge}/story.json`, async route => {
    const response = await route.fetch(); const story = await response.json();
    delete story.body.interaction.advance.inputs; delete story.body.interaction.scroll;
    await route.fulfill({ response, json: story });
  });
  await open(page);
  await expect(page.locator('#app')).not.toHaveAttribute('tabindex');
  await next(page).focus();
  await page.keyboard.press('ArrowDown');
  await expect(controls(page)).toHaveAttribute('data-moving', 'false');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

import { expect, test, type Page } from '@playwright/test';
const ridge = '550e8400-e29b-41d4-a716-446655440000';
const cards = 'c6c6bfa1-145e-4d68-a2fd-cc94107b46ea';
const coast = 'b670153e-79da-4bb4-9d69-1b8efb433287';
interface Moment { id: string; scrollY: number }
declare global { interface Window { snapBeats: Moment[]; snapNativeEnds: Array<{ y: number; id: string }>; snapMoves: number } }
const bar = (page: Page) => page.getByRole('navigation', { name: 'Story navigation' });
test.beforeEach(async ({ page }) => {
  await page.route(`**/stories/${ridge}/story.json`, async route => {
    const response = await route.fetch(); const story = await response.json();
    story.body.interaction.advance.inputs = ['controls', 'keyboard'];
    story.body.interaction.scroll = { snap: 'beats' };
    await route.fulfill({ response, json: story });
  });
});
async function open(page: Page, id = ridge) {
  await page.addInitScript(() => {
    window.snapBeats = []; window.snapNativeEnds = []; window.snapMoves = 0;
    document.addEventListener('story:beats', event => { window.snapBeats = (event as CustomEvent).detail.map(({ id, scrollY }: Moment) => ({ id, scrollY })); });
    document.addEventListener('scrollend', () => {
      if (document.querySelector<HTMLElement>('.reader-controls')?.dataset.moving !== 'false' || !window.snapBeats.length) return;
      const nearest = window.snapBeats.reduce((a, b) => Math.abs(b.scrollY - scrollY) < Math.abs(a.scrollY - scrollY) ? b : a);
      window.snapNativeEnds.push({ y: scrollY, id: nearest.id });
    });
  });
  await page.goto(`/s/${id}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    new MutationObserver(records => { window.snapMoves += records.filter(record => record.oldValue === null).length; })
      .observe(document.querySelector('.reader-controls')!, { attributes: true, attributeOldValue: true, attributeFilter: ['data-destination-id'] });
    window.snapNativeEnds = [];
  });
}
async function nearest(page: Page) {
  return page.evaluate(() => window.snapBeats.reduce((a, b) => Math.abs(b.scrollY - scrollY) < Math.abs(a.scrollY - scrollY) ? b : a));
}
async function landed(page: Page, id: string) {
  await expect.poll(() => page.evaluate(id => Math.abs(scrollY - window.snapBeats.find(beat => beat.id === id)!.scrollY), id)).toBeLessThanOrEqual(2);
  await expect(bar(page)).toHaveAttribute('data-moving', 'false');
}
async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const x = page.viewportSize()!.width / 2;
  const y = Math.min(450, page.viewportSize()!.height * .6);
  return {
    start: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }),
    move: (dy: number) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy, id: 1 }] }),
    end: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    close: () => cdp.detach(),
  };
}
for (const fallback of [false, true]) test(`finger-down scrolling stays native and only snaps after release (${fallback ? 'fallback' : 'scrollend'})`, async ({ page }) => {
  if (fallback) await page.addInitScript(() => { delete (Document.prototype as unknown as Record<string, unknown>).onscrollend; });
  await open(page);
  if (fallback) expect(await page.evaluate(() => 'onscrollend' in document)).toBe(false);
  const input = await touch(page);
  await input.start(); await page.waitForTimeout(40); await input.move(-90);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(30);
  await page.waitForTimeout(450); // A stationary finger must still prevent snapping.
  expect(await page.evaluate(() => window.snapMoves)).toBe(0);
  const before = await page.evaluate(() => scrollY);
  await input.move(-220); await page.waitForTimeout(400);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(before + 70);
  expect(await page.evaluate(() => window.snapMoves)).toBe(0);
  const target = await nearest(page);
  await input.end(); await input.close(); await landed(page, target.id);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.snapMoves)).toBe(1);
});

test('momentum completes before snapping to its nearest Beat', async ({ page }) => {
  await open(page);
  const input = await touch(page);
  await input.start(); await page.waitForTimeout(35);
  await input.move(-45); await page.waitForTimeout(25);
  await input.move(-110); await page.waitForTimeout(25);
  await input.move(-180); await input.end(); await input.close();
  await expect.poll(() => page.evaluate(() => window.snapNativeEnds.length)).toBeGreaterThan(0);
  const settled = await page.evaluate(() => window.snapNativeEnds[0]);
  await landed(page, settled.id);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.snapMoves)).toBeLessThanOrEqual(1);
});

test('touch interrupts a snap immediately and a stationary contact never restarts it', async ({ page }) => {
  await open(page);
  await page.mouse.move(page.viewportSize()!.width / 2, 250);
  await page.mouse.wheel(0, 280);
  await expect(bar(page)).toHaveAttribute('data-moving', 'true');
  const input = await touch(page); await input.start();
  await expect(bar(page)).toHaveAttribute('data-moving', 'false');
  await page.waitForTimeout(100);
  const stopped = await page.evaluate(() => scrollY);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(stopped, 0);
  await input.end(); await input.close(); await page.waitForTimeout(600);
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(stopped, 0);
});

test('wheel settles to a Beat with reduced motion and buttons do not trigger a second snap', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.mouse.move(page.viewportSize()!.width / 2, 250);
  await page.mouse.wheel(0, 230);
  await expect.poll(() => page.evaluate(() => window.snapNativeEnds.length)).toBeGreaterThan(0);
  const target = await page.evaluate(() => window.snapNativeEnds[0].id);
  await landed(page, target);
  const before = await page.evaluate(() => window.snapMoves);
  await bar(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(bar(page)).toHaveAttribute('data-moving', 'false');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.snapMoves)).toBe(before + 1);
});

test('loading, programmatic positioning and explicit snap none do not start automatic movement', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.evaluate(() => scrollTo(0, 320)); await page.waitForTimeout(700);
  expect(await page.evaluate(() => scrollY)).toBe(320);
  expect(await page.evaluate(() => window.snapMoves)).toBe(0);
  await page.route(`**/stories/${ridge}/story.json`, async route => {
    const response = await route.fetch(); const story = await response.json();
    story.body.interaction.scroll.snap = 'none';
    await route.fulfill({ response, json: story });
  });
  await open(page);
  await page.mouse.move(page.viewportSize()!.width / 2, 250); await page.mouse.wheel(0, 180);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.snapMoves)).toBe(0);
});

test('Escape and route teardown cancel pending or active snapping', async ({ page }) => {
  await open(page);
  await page.mouse.move(page.viewportSize()!.width / 2, 250); await page.mouse.wheel(0, 280);
  await expect(bar(page)).toHaveAttribute('data-moving', 'true');
  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveAttribute('data-moving', 'false');
  const y = await page.evaluate(() => scrollY); await page.waitForTimeout(700);
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(y, 0);
  await page.mouse.wheel(0, 180);
  await page.evaluate(id => { history.pushState(null, '', `/s/${id}`); dispatchEvent(new PopStateEvent('popstate')); }, coast);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(700);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(bar(page)).toHaveCount(0);
});

test('snap resolves a pinned Card timeline Beat from settled native scroll', async ({ page }) => {
  await page.route(`**/stories/${cards}/story.json`, async route => {
    const response = await route.fetch(); const story = await response.json();
    story.body.interaction.scroll = { snap: 'beats' };
    await route.fulfill({ response, json: story });
  });
  await open(page, cards);
  const hold = await page.evaluate(() => window.snapBeats.find(beat => beat.id === 'lunora-card-hold')!.scrollY);
  await page.mouse.move(page.viewportSize()!.width / 2, 250); await page.mouse.wheel(0, hold + 20);
  await landed(page, 'lunora-card-hold');
  await expect(page.locator('[data-frame-id="lunora-card"] .frame-content img')).toHaveCSS('opacity', '1');
});

for (const inputType of ['tap', 'boundary wheel']) test(`${inputType} without scrolling does not leave a future snap armed`, async ({ page }) => {
  await open(page);
  if (inputType === 'tap') {
    const input = await touch(page); await input.start(); await input.end(); await input.close();
  } else {
    await page.mouse.move(page.viewportSize()!.width / 2, 250); await page.mouse.wheel(0, -120);
  }
  await page.waitForTimeout(300);
  await page.evaluate(() => scrollTo(0, 320)); await page.waitForTimeout(850);
  expect(await page.evaluate(() => scrollY)).toBe(320);
  expect(await page.evaluate(() => window.snapMoves)).toBe(0);
});

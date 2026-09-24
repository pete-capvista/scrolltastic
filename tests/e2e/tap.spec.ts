import { expect, test, type Page } from '@playwright/test';
const ridge = '550e8400-e29b-41d4-a716-446655440000';
interface Moment { id: string; scrollY: number }
declare global { interface Window { tapBeats: Moment[]; tapMoves: number } }
const bar = (page: Page) => page.getByRole('navigation', { name: 'Story navigation' });
async function open(page: Page) {
  await page.addInitScript(() => {
    window.tapBeats = []; window.tapMoves = 0;
    document.addEventListener('story:beats', event => { window.tapBeats = (event as CustomEvent).detail.map(({ id, scrollY }: Moment) => ({ id, scrollY })); });
  });
  await page.goto(`/s/${ridge}`); await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    new MutationObserver(records => { window.tapMoves += records.filter(record => record.oldValue === null).length; })
      .observe(document.querySelector('.reader-controls')!, { attributes: true, attributeOldValue: true, attributeFilter: ['data-destination-id'] });
  });
}
async function next(page: Page) { return page.evaluate(() => window.tapBeats.find(beat => beat.scrollY > scrollY + 2)!); }
async function landed(page: Page, id: string) {
  await expect.poll(() => page.evaluate(id => Math.abs(scrollY - window.tapBeats.find(beat => beat.id === id)!.scrollY), id)).toBeLessThanOrEqual(2);
  await expect(bar(page)).toHaveAttribute('data-moving', 'false');
}
async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const x = page.viewportSize()!.width / 2, y = 300;
  return {
    start: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }),
    move: (dy: number) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy, id: 1 }] }),
    end: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    close: () => cdp.detach(),
  };
}

test('touch tap advances exactly once, including its compatibility click', async ({ page }) => {
  await open(page); const target = await next(page); const input = await touch(page);
  await input.start(); await page.waitForTimeout(40); await input.end(); await input.close();
  await landed(page, target.id); await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.tapMoves)).toBe(1);
});

test('a mouse click advances and native Next still advances only once', async ({ page }) => {
  await open(page); const target = await next(page);
  await page.mouse.click(page.viewportSize()!.width / 2, 300); await landed(page, target.id);
  const onward = await next(page);
  await bar(page).getByRole('button', { name: 'Next', exact: true }).click(); await landed(page, onward.id);
  await page.waitForTimeout(400); expect(await page.evaluate(() => window.tapMoves)).toBe(2);
});

test('dragging and wheel scrolling remain free with no movement after settling', async ({ page }) => {
  await open(page); const input = await touch(page);
  await input.start(); await page.waitForTimeout(40); await input.move(-80);
  await page.waitForTimeout(40); await input.move(-190);
  await page.waitForTimeout(300); await input.end(); await input.close();
  await page.waitForTimeout(500);
  const y = await page.evaluate(() => scrollY); expect(y).toBeGreaterThan(60);
  await page.waitForTimeout(700); expect(await page.evaluate(() => scrollY)).toBeCloseTo(y, 0);
  await page.mouse.move(page.viewportSize()!.width / 2, 300); await page.mouse.wheel(0, 180);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.tapMoves)).toBe(0);
});

test('long presses and interactive content do not advance', async ({ page }) => {
  await open(page); const input = await touch(page);
  await input.start(); await page.waitForTimeout(450); await input.end(); await input.close();
  await page.evaluate(() => {
    const button = document.createElement('button'); button.textContent = 'Story action';
    button.style.cssText = 'position:fixed;left:45%;top:250px;z-index:200';
    button.onclick = () => { button.textContent = 'Action received'; };
    document.querySelector('#app')!.append(button);
  });
  await page.getByRole('button', { name: 'Story action' }).click();
  await expect(page.getByRole('button', { name: 'Action received' })).toBeVisible();
  expect(await page.evaluate(() => window.tapMoves)).toBe(0);
});

test('a touch that interrupts assisted movement does not also advance', async ({ page }) => {
  await open(page);
  await bar(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(bar(page)).toHaveAttribute('data-moving', 'true');
  const input = await touch(page); await input.start();
  await expect(bar(page)).toHaveAttribute('data-moving', 'false');
  await input.end(); await input.close();
  const y = await page.evaluate(() => scrollY); await page.waitForTimeout(800);
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(y, 0);
  expect(await page.evaluate(() => window.tapMoves)).toBe(1);
});

test('reduced-motion taps advance while a tap at the final Beat is a no-op', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await open(page);
  const target = await next(page); await page.mouse.click(page.viewportSize()!.width / 2, 300);
  await landed(page, target.id);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300);
  const y = await page.evaluate(() => scrollY);
  await page.mouse.click(page.viewportSize()!.width / 2, 300); await page.waitForTimeout(500);
  expect(await page.evaluate(() => scrollY)).toBe(y);
  expect(await page.evaluate(() => window.tapMoves)).toBe(1);
});

test('a tap used to stop native momentum does not Advance', async ({ page }) => {
  await open(page); const input = await touch(page);
  await input.start(); await page.waitForTimeout(30); await input.move(-60);
  await page.waitForTimeout(25); await input.move(-150); await input.end();
  await page.waitForTimeout(30); await input.start(); await page.waitForTimeout(60);
  await input.end(); await input.close(); await page.waitForTimeout(250);
  const y = await page.evaluate(() => scrollY); await page.waitForTimeout(650);
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(y, 0);
  expect(await page.evaluate(() => window.tapMoves)).toBe(0);
});

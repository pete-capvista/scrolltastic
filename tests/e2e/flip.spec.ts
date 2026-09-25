import { expect, test, type Page } from '@playwright/test';
const ridge = '550e8400-e29b-41d4-a716-446655440000';
const cards = 'c6c6bfa1-145e-4d68-a2fd-cc94107b46ea';
const coast = 'b670153e-79da-4bb4-9d69-1b8efb433287';
interface Moment { id: string; scrollY: number }
declare global { interface Window { flipBeats: Moment[]; flipMoves: number } }
const bar = (page: Page) => page.getByRole('navigation', { name: 'Story navigation' });
// Preserve coverage of the opt-in 0.12 recognizer using the current artwork.
async function legacyFlip(page: Page) {
  await page.route(`**/stories/${ridge}/story.json`, async route => {
    const response = await route.fetch(); const story = await response.json();
    delete story.body.interaction.scroll;
    story.body.interaction.advance.inputs = ['controls', 'keyboard', 'flip'];
    await route.fulfill({ response, json: story });
  });
}
test.beforeEach(async ({ page }) => { await legacyFlip(page); });
async function open(page: Page, id = ridge) {
  await page.addInitScript(() => {
    window.flipBeats = [];
    document.addEventListener('story:beats', event => { window.flipBeats = (event as CustomEvent).detail.map(({ id, scrollY }: Moment) => ({ id, scrollY })); });
  });
  await page.goto(`/s/${id}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    window.flipMoves = 0;
    new MutationObserver(records => {
      window.flipMoves += records.filter(record => record.attributeName === 'data-destination-id' && record.oldValue === null).length;
    }).observe(document.querySelector('.reader-controls')!, { attributes: true, attributeOldValue: true, attributeFilter: ['data-destination-id'] });
  });
}
async function destination(page: Page, reverse = false) {
  return page.evaluate(reverse => (reverse ? [...window.flipBeats].reverse() : window.flipBeats).find(beat => reverse ? beat.scrollY < scrollY - 2 : beat.scrollY > scrollY + 2)!, reverse);
}
async function landed(page: Page, id: string) {
  await expect(bar(page)).toHaveAttribute('data-moving', 'false');
  await expect.poll(() => page.evaluate(id => Math.abs(scrollY - window.flipBeats.find(beat => beat.id === id)!.scrollY), id)).toBeLessThanOrEqual(2);
}
// CDP exercises browser touch arbitration and native scrolling, rather than
// merely dispatching synthetic events whose preventDefault cannot affect scroll.
async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const x = page.viewportSize()!.width / 2;
  const y = Math.min(400, page.viewportSize()!.height / 2);
  return {
    y,
    start: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }),
    move: (dy: number) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy, id: 1 }] }),
    end: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    cancel: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }),
    close: () => cdp.detach(),
  };
}
async function flick(page: Page, down = false) {
  const input = await touch(page);
  await input.start(); await page.waitForTimeout(35);
  await input.move(down ? 60 : -60); await page.waitForTimeout(25);
  await input.end(); await input.close();
}

test('real touch flicks Advance and Reverse on the story without moving focus', async ({ page }) => {
  await open(page);
  for (let index = 0; index < 2; index++) {
    const target = await destination(page);
    await flick(page); await landed(page, target.id);
  }
  const back = await destination(page, true);
  await flick(page, true); await landed(page, back.id);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test('slow drags remain native and a fast start that becomes a long drag stays continuous', async ({ page }) => {
  await open(page);
  const slow = await touch(page);
  await slow.start(); await page.waitForTimeout(180);
  await slow.move(-45); await page.waitForTimeout(100);
  await slow.move(-130); await page.waitForTimeout(100);
  await slow.end(); await slow.close();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(30);
  await expect(bar(page)).toHaveAttribute('data-moving', 'false');
  // Wait for native momentum to finish before a new gesture.
  await page.waitForTimeout(700);
  await page.evaluate(() => scrollTo(0, 0));
  const long = await touch(page);
  await long.start(); await page.waitForTimeout(30);
  await long.move(-60); await page.waitForTimeout(35);
  await long.move(-180); await page.waitForTimeout(40);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await long.end(); await long.close();
  await expect(bar(page)).toHaveAttribute('data-moving', 'false');
  expect(await page.evaluate(() => window.flipMoves)).toBe(0);
});

test('touch cancellation and manual touch during assistance do not queue a Flip', async ({ page }) => {
  await open(page);
  const input = await touch(page);
  await input.start(); await page.waitForTimeout(30); await input.move(-60); await input.cancel();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.flipMoves)).toBe(0);
  await bar(page).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(bar(page)).toHaveAttribute('data-moving', 'true');
  await input.start();
  await expect(bar(page)).toHaveAttribute('data-moving', 'false');
  await input.end(); await input.close();
  await page.waitForTimeout(650);
  await expect(bar(page)).toHaveAttribute('data-moving', 'false');
});

test('reduced-motion Flip uses the same Beat destinations and honors boundaries', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const target = await destination(page);
  await flick(page); await landed(page, target.id);
  await page.evaluate(() => scrollTo(0, 0));
  await flick(page, true); // No preceding Beat: browser retains the gesture.
  await expect(bar(page)).toHaveAttribute('data-moving', 'false');
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('Flip is reusable on a pinned Card timeline through the input contract', async ({ page }) => {
  await page.route(`**/stories/${cards}/story.json`, async route => {
    const response = await route.fetch(); const story = await response.json();
    story.body.interaction.advance.inputs.push('flip');
    await route.fulfill({ response, json: story });
  });
  await open(page, cards);
  for (const id of ['lunora-arrival', 'lunora-card-hold', 'lunora-return-art']) {
    expect((await destination(page)).id).toBe(id);
    await flick(page); await landed(page, id);
  }
});

test('pending gestures are removed on route teardown', async ({ page }) => {
  await open(page);
  const input = await touch(page);
  await input.start(); await page.waitForTimeout(30); await input.move(-60);
  await page.evaluate(id => { history.pushState(null, '', `/s/${id}`); dispatchEvent(new PopStateEvent('popstate')); }, coast);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await input.end(); await input.close();
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(bar(page)).toHaveCount(0);
});

test('editable and multi-touch gestures are not consumed', async ({ page }) => {
  await open(page);
  const prevented = await page.evaluate(async () => {
    const host = document.querySelector<HTMLElement>('#app')!;
    const field = document.createElement('input'); host.prepend(field);
    const run = async (target: HTMLElement, multiple: boolean) => {
      const point = (id: number, y: number) => new Touch({ identifier: id, target, clientX: 100 + id * 40, clientY: y });
      const dispatch = (type: string, y: number) => {
        const touches = multiple ? [point(1, y), point(2, y)] : [point(1, y)];
        const event = new TouchEvent(type, { bubbles: true, cancelable: true, touches, changedTouches: touches });
        target.dispatchEvent(event); return event.defaultPrevented;
      };
      dispatch('touchstart', 400); await new Promise(resolve => setTimeout(resolve, 30));
      const result = dispatch('touchmove', 340);
      target.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true })); return result;
    };
    const results = [await run(field, false), await run(host, true)];
    field.remove(); return results;
  });
  expect(prevented).toEqual([false, false]);
  expect(await page.evaluate(() => window.flipMoves)).toBe(0);
});

test('holding a captured flick turns it into a continuous drag without advancing', async ({ page }) => {
  await open(page);
  const input = await touch(page);
  await input.start(); await page.waitForTimeout(30); await input.move(-60);
  await page.waitForTimeout(300);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(30);
  await input.move(-90); await input.end(); await input.close();
  expect(await page.evaluate(() => window.flipMoves)).toBe(0);
  await expect(bar(page)).toHaveAttribute('data-moving', 'false');
});

test('omitting Flip keeps quick flicks native and wheel input never becomes a Flip', async ({ page }) => {
  await page.route(`**/stories/${ridge}/story.json`, async route => {
    const response = await route.fetch(); const story = await response.json();
    story.body.interaction.advance.inputs = ['controls', 'keyboard']; delete story.body.interaction.scroll;
    await route.fulfill({ response, json: story });
  });
  await open(page);
  await flick(page);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.flipMoves)).toBe(0);
  await page.unroute(`**/stories/${ridge}/story.json`);
  await legacyFlip(page);
  await open(page);
  await page.mouse.wheel(0, 160);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.flipMoves)).toBe(0);
});

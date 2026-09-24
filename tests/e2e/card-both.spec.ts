import { test, expect, type Page } from '@playwright/test';

const id = 'c6c6bfa1-145e-4d68-a2fd-cc94107b46ea';
const selector = '[data-panel-id="lunora-entry"]';

async function open(page: Page, flow = false) {
  // Keep downstream content static to isolate the moving Panel's contribution.
  await page.route(`**/stories/${id}/story.json`, async route => {
    const response = await route.fetch();
    const story = await response.json();
    const items = story.body.containers[0].flow;
    delete items[2].frames[1].artwork;
    if (flow) items[0].frames[1].artwork.transition.scrollMode = 'flow';
    items.push({ type: 'space', height: '200svh' });
    await route.fulfill({ response, json: story });
  });
  await page.goto(`/s/${id}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(300); // Initial safe ScrollTrigger refresh.
}

async function geometry(page: Page) {
  return page.locator(selector).evaluate(element => {
    const panel = element as HTMLElement;
    const previous = panel.style.height;
    const top = panel.getBoundingClientRect().top + scrollY;
    panel.style.height = 'auto';
    const natural = Math.max(panel.getBoundingClientRect().height, panel.scrollHeight);
    panel.style.height = previous;
    return { start: Math.max(0, top - innerHeight), end: top + natural, natural, art: panel.clientWidth / .846 / .704878 * .37 };
  });
}

async function stateAt(page: Page, metrics: Awaited<ReturnType<typeof geometry>>, progress: number) {
  await page.evaluate(y => scrollTo(0, y), metrics.start + progress * (metrics.end - metrics.start));
  await page.waitForTimeout(100);
  return page.locator(selector).evaluate(element => {
    const panel = element as HTMLElement;
    const front = panel.querySelector('.frame-content--card img')!;
    const mask = panel.querySelector('.card-art-mask')!;
    return {
      height: panel.getBoundingClientRect().height,
      opacity: Number(getComputedStyle(front).opacity),
      maskOpacity: Number(getComputedStyle(mask).opacity),
      clip: getComputedStyle(mask).clipPath,
      followingTop: document.querySelector('[data-panel-id="dravion-entry"]')!.getBoundingClientRect().top + scrollY,
      scroll: scrollY,
    };
  });
}

for (const flow of [false, true]) {
  test(`BOTH + FIT phases reverse and preserve downstream flow (${flow ? 'flow' : 'pin'})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page, flow);
    const metrics = await geometry(page);
    const first = await stateAt(page, metrics, 0);
    const entering = await stateAt(page, metrics, .17);
    const hold = await stateAt(page, metrics, .4);
    const lateHold = await stateAt(page, metrics, .58);
    const exiting = await stateAt(page, metrics, .8);
    const last = await stateAt(page, metrics, .98);
    expect(first.height).toBeCloseTo(metrics.art, 0);
    expect(first.opacity).toBe(0);
    expect(first.maskOpacity).toBe(1);
    expect(entering.height).toBeGreaterThan(first.height);
    expect(entering.height).toBeLessThan(hold.height);
    expect(hold.height).toBeCloseTo(metrics.natural, 0);
    expect(hold.opacity).toBe(1);
    expect(lateHold.height).toBeCloseTo(hold.height, 1);
    expect(lateHold.opacity).toBe(1);
    expect(exiting.height).toBeLessThan(hold.height);
    expect(exiting.height).toBeGreaterThan(last.height);
    expect(last.height).toBeCloseTo(metrics.art, 0);
    expect(last.opacity).toBe(0);
    expect(last.clip).toBe('inset(0px)');
    if (flow) expect(hold.followingTop - last.followingTop).toBeCloseTo(metrics.natural - metrics.art, 0);
    const reverseHold = await stateAt(page, metrics, .4);
    const reverseArt = await stateAt(page, metrics, 0);
    expect(reverseHold.height).toBeCloseTo(hold.height, 0);
    expect(reverseHold.opacity).toBe(1);
    expect(reverseArt.height).toBeCloseTo(first.height, 0);
    expect(reverseArt.opacity).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('BOTH remeasures on resize and restores static Cards for reduced motion', async ({ page }) => {
  await open(page);
  const metrics = await geometry(page);
  await stateAt(page, metrics, .45);
  await page.setViewportSize({ width: 600, height: 700 });
  await page.waitForTimeout(400);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(150);
  const resized = await geometry(page);
  const art = await stateAt(page, resized, 0);
  expect(art.height).toBeCloseTo(resized.art, 0);
  expect((await stateAt(page, resized, .45)).opacity).toBe(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.pin-spacer')).toHaveCount(0);
  await expect(page.locator(`${selector} .frame-content--card img`)).toHaveCSS('opacity', '1');
  expect(await page.locator(selector).evaluate(el => (el as HTMLElement).style.height)).toBe('');
  await expect(page.locator(`${selector} .card-art-mask`)).toHaveCSS('visibility', 'hidden');
  await page.evaluate(() => scrollTo(0, 200));
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.pin-spacer')).toHaveCount(1);
  await page.evaluate(() => { history.pushState(null, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.locator('.pin-spacer')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading')).toHaveText('Every story starts with a link.');
});


test('a short pinned BOTH story has enough native scroll distance to reach OUT', async ({ page }) => {
  await page.route(`**/stories/${id}/story.json`, async route => {
    const response = await route.fetch();
    const story = await response.json();
    story.body.containers[0].flow = [story.body.containers[0].flow[0]];
    await route.fulfill({ response, json: story });
  });
  await page.goto(`/s/${id}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(300);
  const metrics = await geometry(page);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  // A safe ScrollTrigger refresh may defer the final scrub render. Await the
  // authored OUT state instead of sampling during its refresh window.
  await expect.poll(() => page.locator(selector).evaluate(el => el.getBoundingClientRect().height)).toBeCloseTo(metrics.art, 0);
  const result = await page.locator(selector).evaluate(el => ({
    height: el.getBoundingClientRect().height,
    opacity: getComputedStyle(el.querySelector('.frame-content--card img')!).opacity,
    scroll: scrollY,
  }));
  expect(result.scroll).toBeGreaterThanOrEqual(.95 * (metrics.end - metrics.start) + metrics.start - 1);
  expect(result.height).toBeCloseTo(metrics.art, 0);
  expect(result.opacity).toBe('0');
});

test('a downstream reveal refreshes after BOTH changes Panel height', async ({ page }) => {
  await page.route(`**/stories/${id}/story.json`, async route => {
    const response = await route.fetch();
    const story = await response.json();
    const items = story.body.containers[0].flow;
    delete items[2].frames[1].artwork;
    items[4].frames[0].scrollAnimation = { type: 'reveal' };
    items.push({ type: 'space', height: '200svh' });
    await route.fulfill({ response, json: story });
  });
  await page.goto(`/s/${id}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(300);
  const metrics = await geometry(page);
  await stateAt(page, metrics, .98);
  await page.waitForTimeout(300);
  const reveal = page.locator('[data-frame-id="volgarr-caption"] .frame-content');
  const destination = await page.locator('[data-panel-id="volgarr-entry"]').evaluate(el => el.getBoundingClientRect().top + scrollY - innerHeight * .685);
  await page.evaluate(y => scrollTo(0, y), destination);
  await expect.poll(async () => Number(await reveal.evaluate(el => getComputedStyle(el).opacity))).toBeCloseTo(.5, 1);
});

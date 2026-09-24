import { test, expect, type Page } from '@playwright/test';

const ridge = '550e8400-e29b-41d4-a716-446655440000';
const cards = 'c6c6bfa1-145e-4d68-a2fd-cc94107b46ea';
interface BeatSnapshot { id: string; source: string; scrollY: number; order: number; fallback: boolean; progress?: number }
declare global { interface Window { testBeats: BeatSnapshot[]; testBeatUpdates: number } }
async function open(page: Page, id: string) {
  await page.addInitScript(() => {
    window.testBeats = [];
    window.testBeatUpdates = 0;
    document.addEventListener('story:beats', event => {
      window.testBeatUpdates++;
      window.testBeats = (event as CustomEvent).detail.map(({ element: _, ...beat }: { element: HTMLElement }) => beat);
    });
  });
  await page.goto(`/s/${id}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => page.evaluate(() => window.testBeats.length)).toBeGreaterThan(0);
}
const beats = (page: Page) => page.evaluate(() => window.testBeats);
async function beat(page: Page, id: string) { return (await beats(page)).find(beat => beat.id === id)!; }
async function settle(page: Page) { await page.waitForTimeout(350); }

test('Element Beats use positioned geometry, signed offsets and reachable coordinates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, ridge);
  const expected = await page.evaluate(() => {
    const panel = document.querySelector('[data-panel-id="arrival"]')!.getBoundingClientRect();
    const frame = document.querySelector('[data-frame-id="question"] .frame-placement')!.getBoundingClientRect();
    const availableHeight = innerHeight - (document.querySelector('.reader-controls')?.getBoundingClientRect().height ?? 0);
    return { panel: panel.top + scrollY, frame: Math.max(0, frame.top + scrollY + (frame.height - availableHeight) / 2 - .08 * innerHeight) };
  });
  expect((await beat(page, 'ridge-arrival')).scrollY).toBeCloseTo(expected.panel, 0);
  expect((await beat(page, 'doorway-question')).scrollY).toBeCloseTo(expected.frame, 0);
  const index = await beats(page);
  expect(index.map(b => b.order)).toEqual(index.map((_, index) => index));
  expect(index.map(b => b.scrollY)).toEqual(index.map(b => b.scrollY).sort((a, b) => a - b));
  await page.evaluate(() => scrollTo(0, 500));
  await settle(page);
  expect((await beat(page, 'doorway-question')).scrollY).toBeCloseTo(expected.frame, 0);
});

test('Card Timeline Beats reach authored states and Element coordinates do not drift while pinned', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page, cards);
  await expect.poll(async () => (await beat(page, 'lunora-card-hold')).fallback).toBe(false);
  await settle(page);
  const opening = await beat(page, 'lunora-opening-art');
  const hold = await beat(page, 'lunora-card-hold');
  const ending = await beat(page, 'lunora-return-art');
  const arrival = await beat(page, 'lunora-arrival');
  expect(hold.scrollY).toBeCloseTo(opening.scrollY + (ending.scrollY - opening.scrollY) * .45 / .95, 1);
  const front = page.locator('[data-frame-id="lunora-card"] .frame-content img');
  await page.evaluate(y => scrollTo(0, y), hold.scrollY);
  await expect(front).toHaveCSS('opacity', '1');
  await settle(page);
  expect((await beat(page, 'lunora-arrival')).scrollY).toBeCloseTo(arrival.scrollY, 0);
  expect((await beat(page, 'lunora-card-hold')).scrollY).toBeCloseTo(hold.scrollY, 0);
  const natural = await page.locator('[data-panel-id="lunora-entry"]').evaluate(el => el.getBoundingClientRect().height);
  await page.evaluate(y => scrollTo(0, y), ending.scrollY);
  await expect(front).toHaveCSS('opacity', '0');
  const art = await page.locator('[data-panel-id="lunora-entry"]').evaluate(el => el.getBoundingClientRect().height);
  expect(art).toBeLessThan(natural);
  await page.evaluate(y => scrollTo(0, y), hold.scrollY);
  await expect(front).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  expect(errors).toEqual([]);
});

test('Mask Timeline Beats use the full timeline and recalculate after resize', async ({ page }) => {
  await open(page, ridge);
  await expect.poll(async () => (await beat(page, 'signal-takeover')).fallback).toBe(false);
  const verify = async () => {
    const range = await page.locator('[data-panel-id="signal"]').evaluate(el => {
      const rect = el.getBoundingClientRect();
      const max = document.documentElement.scrollHeight - innerHeight;
      return { start: Math.max(0, rect.top + scrollY - innerHeight), end: Math.min(max, rect.bottom + scrollY) };
    });
    expect((await beat(page, 'signal-opening')).scrollY).toBeCloseTo(range.start + .18 * (range.end - range.start), 0);
    expect((await beat(page, 'signal-takeover')).scrollY).toBeCloseTo(range.start + .78 * (range.end - range.start), 0);
  };
  await settle(page);
  await verify();
  const previous = (await beat(page, 'signal-takeover')).scrollY;
  await page.setViewportSize({ width: 600, height: 650 });
  await expect.poll(async () => (await beat(page, 'signal-takeover')).scrollY).not.toBe(previous);
  await settle(page);
  await verify();
  await page.evaluate(y => scrollTo(0, y), (await beat(page, 'signal-takeover')).scrollY + 1);
  await expect(page.locator('[data-frame-id="focus-mask"] .frame-placement')).toHaveCSS('width', `${await page.locator('[data-panel-id="signal"]').evaluate(el => el.clientWidth)}px`);
});

test('reduced motion preserves Timeline Beat IDs as coincident Frame-center fallbacks', async ({ page }) => {
  await open(page, cards);
  await expect.poll(async () => (await beat(page, 'lunora-card-hold')).fallback).toBe(false);
  const ids = (await beats(page)).map(b => b.id).sort();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await beat(page, 'lunora-card-hold')).fallback).toBe(true);
  await settle(page);
  const expected = await page.locator('[data-frame-id="lunora-card"] .frame-placement').evaluate(el => {
    const rect = el.getBoundingClientRect();
    const availableHeight = innerHeight - (document.querySelector('.reader-controls')?.getBoundingClientRect().height ?? 0);
    return Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, rect.top + scrollY + (rect.height - availableHeight) / 2));
  });
  const timeline = (await beats(page)).filter(b => b.source === 'timeline');
  expect(timeline.map(b => b.id)).toEqual(['lunora-opening-art', 'lunora-card-hold', 'lunora-return-art']);
  for (const b of timeline) { expect(b.fallback).toBe(true); expect(b.scrollY).toBeCloseTo(expected, 0); }
  expect((await beats(page)).map(b => b.id).sort()).toEqual(ids);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => (await beat(page, 'lunora-card-hold')).fallback).toBe(false);
  expect((await beat(page, 'lunora-return-art')).scrollY).toBeGreaterThan((await beat(page, 'lunora-card-hold')).scrollY);
});

test('static embed exposes immutable Beats at readiness and destroys pending work', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async id => {
    const moduleUrl = '/src/renderer/mount.ts';
    const { mountStory } = await import(/* @vite-ignore */ moduleUrl);
    const story = await (await fetch(`/stories/${id}/story.json`)).json();
    const root = document.createElement('div');
    document.body.prepend(root);
    let calls = 0;
    const handle = mountStory(root, story, { assetBaseUrl: `${location.origin}/stories/${id}/`, onBeatsChange: () => calls++ });
    await handle.ready;
    const index = handle.beats;
    const initial = { count: index.length, fallback: index.filter((b: BeatSnapshot) => b.source === 'timeline').every((b: BeatSnapshot) => b.fallback), frozen: Object.isFrozen(index) && index.every(Object.isFrozen) };
    handle.destroy();
    const stopped = calls;
    dispatchEvent(new Event('resize'));
    dispatchEvent(new Event('scroll'));
    await new Promise(resolve => setTimeout(resolve, 100));
    const cleaned = calls === stopped && handle.beats.length === 0 && root.childElementCount === 0;
    const cancelled = mountStory(root, story, { assetBaseUrl: `${location.origin}/stories/${id}/`, onBeatsChange: () => calls++ });
    const before = calls;
    cancelled.destroy();
    await cancelled.ready;
    root.remove();
    return { ...initial, cleaned, cancelled: calls === before };
  }, cards);
  expect(result).toEqual({ count: 5, fallback: true, frozen: true, cleaned: true, cancelled: true });
});

for (const flow of [false, true]) test(`downstream Element Beats track geometry and timeline ranges rebuild (${flow ? 'flow' : 'pin'})`, async ({ page }) => {
  await page.route(`**/stories/${cards}/story.json`, async route => {
    const response = await route.fetch();
    const story = await response.json();
    delete story.body.containers[0].flow[2].frames[1].artwork;
    if (flow) story.body.containers[0].flow[0].frames[1].artwork.transition.scrollMode = 'flow';
    await route.fulfill({ response, json: story });
  });
  await open(page, cards);
  await expect.poll(async () => (await beat(page, 'lunora-card-hold')).fallback).toBe(false);
  const hold = (await beat(page, 'lunora-card-hold')).scrollY;
  await page.evaluate(y => scrollTo(0, y), hold);
  await settle(page);
  const duringHold = (await beat(page, 'dravion-moment')).scrollY;
  await page.evaluate(y => scrollTo(0, y), (await beat(page, 'lunora-return-art')).scrollY + 2);
  // Pin spacing holds the following composition's document position steady;
  // unpinned FIT directly moves it as the Panel contracts. Check actual DOM
  // geometry in both modes, and the contraction specifically in flow mode.
  if (flow) await expect.poll(async () => (await beat(page, 'dravion-moment')).scrollY).toBeLessThan(duringHold);
  const verifyDownstream = async () => {
    const expected = await page.locator('[data-frame-id="dravion-card"] .frame-placement').evaluate(el => {
      const rect = el.getBoundingClientRect();
      const availableHeight = innerHeight - (document.querySelector('.reader-controls')?.getBoundingClientRect().height ?? 0);
      return Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, rect.top + scrollY + (rect.height - availableHeight) / 2));
    });
    expect((await beat(page, 'dravion-moment')).scrollY).toBeCloseTo(expected, 0);
  };
  await settle(page);
  await verifyDownstream();
  await page.evaluate(y => scrollTo(0, y), hold);
  await page.setViewportSize({ width: 550, height: 700 });
  await settle(page);
  await expect.poll(async () => (await beat(page, 'lunora-card-hold')).scrollY).not.toBe(hold);
  await page.evaluate(y => scrollTo(0, y), (await beat(page, 'lunora-card-hold')).scrollY);
  await expect(page.locator('[data-frame-id="lunora-card"] .frame-content img')).toHaveCSS('opacity', '1');
  await settle(page);
  await verifyDownstream();
});

test('animation teardown restores fallback Beats and a destroyed mount receives no refresh updates', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async id => {
    const mountUrl = '/src/renderer/mount.ts';
    const animationUrl = '/src/animation/reveals.ts';
    const { mountStory } = await import(/* @vite-ignore */ mountUrl);
    const { attachStoryAnimations } = await import(/* @vite-ignore */ animationUrl);
    const story = await (await fetch(`/stories/${id}/story.json`)).json();
    const root = document.createElement('div'); document.body.prepend(root);
    let calls = 0;
    const mount = () => mountStory(root, story, { assetBaseUrl: `${location.origin}/stories/${id}/`, onBeatsChange: () => calls++ });
    const settle = () => new Promise(resolve => setTimeout(resolve, 300));
    const handle = mount(); await handle.ready;
    const animations = attachStoryAnimations(handle.elements.get(id), handle.animations);
    await settle();
    const animated = handle.beats.filter((b: BeatSnapshot) => b.source === 'timeline').every((b: BeatSnapshot) => !b.fallback);
    animations.destroy(); await settle();
    const fallback = handle.beats.filter((b: BeatSnapshot) => b.source === 'timeline').every((b: BeatSnapshot) => b.fallback);
    handle.destroy();
    const before = calls;
    dispatchEvent(new Event('resize')); dispatchEvent(new Event('scroll'));
    await settle();
    const stopped = before === calls;
    const second = mount(); await second.ready;
    const secondAnimations = attachStoryAnimations(second.elements.get(id), second.animations);
    await settle();
    const replaced = handle.beats.length === 0 && second.beats.length === 5;
    secondAnimations.destroy(); second.destroy(); root.remove();
    return { animated, fallback, stopped, replaced };
  }, cards);
  expect(result).toEqual({ animated: true, fallback: true, stopped: true, replaced: true });
});

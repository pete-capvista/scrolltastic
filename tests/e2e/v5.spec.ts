import { test, expect } from '@playwright/test';

const english = '11111111-1111-4111-8111-111111111111';
const japanese = '22222222-2222-4222-8222-222222222222';
const arabic = '33333333-3333-4333-8333-333333333333';
const cards = 'c6c6bfa1-145e-4d68-a2fd-cc94107b46ea';
const voices = '77777777-7777-4777-8777-777777777777';

for (const [id, language, direction, speech] of [
  [english, 'en', 'ltr', 'Mira: The lantern is still burning.'],
  [japanese, 'ja', 'ltr', 'ミラ: 灯りはまだ消えていない。'],
  [arabic, 'ar', 'rtl', 'ميرا: المصباح ما زال مضاءً.'],
]) test(`V5 narrative semantics and keyboard navigation (${language})`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/s/${id}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  const body = page.locator('.story-body');
  await expect(body).toHaveAttribute('lang', language);
  await expect(body).toHaveAttribute('dir', direction);
  await expect(page.locator('[data-frame-id="dialogue"] p')).toHaveText(speech);
  await expect(page.locator('[data-panel-id="departure-panel"] img')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[data-panel-id="departure-panel"] img')).toHaveAttribute('alt', '');
  const snapshot = await body.ariaSnapshot();
  expect(snapshot).toContain(speech);
  expect((snapshot.match(/- img /g) ?? []).length).toBe(2);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await next.focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await expect(next).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('typography inherits per property and local language overrides do not mirror physical anchors', async ({ page }) => {
  await page.route(`**/stories/${english}/story.json`, async route => {
    const response = await route.fetch(); const story = await response.json();
    story.body.typography = { font: 'technical', size: 'large', weight: 'bold', lineHeight: 'relaxed' };
    story.body.containers[0].typography = { style: 'italic' };
    const panel = story.body.containers[0].flow[2];
    panel.typography = { align: 'end' };
    panel.frames[0].typography = { size: 'small' };
    panel.frames[0].language = 'ar'; panel.frames[0].direction = 'rtl';
    await route.fulfill({ response, json: story });
  });
  await page.goto(`/s/${english}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  const dialogue = page.locator('[data-frame-id="dialogue"]');
  await expect(dialogue).toHaveAttribute('lang', 'ar');
  await expect(dialogue).toHaveAttribute('dir', 'rtl');
  const style = await dialogue.locator('.frame-content').evaluate(el => {
    const s = getComputedStyle(el);
    return { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, style: s.fontStyle, align: s.textAlign, leading: s.lineHeight };
  });
  expect(style).toMatchObject({ size: '16px', weight: '700', style: 'italic', align: 'end', leading: '28.8px' });
  expect(style.family).toContain('monospace');
});

test('Narrative shapes, Dialogue styles and Sound Effects retain semantic text', async ({ page }) => {
  await page.goto(`/s/${voices}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('[data-frame-id="urgent-narrative"] .frame-content')).toHaveAttribute('data-shape', 'parallelogram');
  await expect(page.locator('[data-frame-id="torn-narrative"] .frame-content')).toHaveAttribute('data-shape', 'torn-ribbon');
  const first = page.locator('[data-frame-id="dialogue-one"]');
  await expect(first).toHaveAttribute('data-chain-connector', 'bridge');
  await expect(first.locator('.frame-content')).not.toHaveAttribute('data-tail-style');
  const connector = await first.locator('.frame-placement').evaluate(element => {
    const style = getComputedStyle(element, '::after');
    return { display: style.display, height: parseFloat(style.height) };
  });
  expect(connector.display).toBe('block');
  expect(connector.height).toBeGreaterThan(0);
  const thought = page.locator('[data-frame-id="thought"] .frame-content');
  await expect(thought).toHaveAttribute('data-dialogue-style', 'thought');
  await expect(thought).toHaveAttribute('data-shape', 'cloud');
  await expect(thought).toHaveAttribute('data-tail-style', 'circle-chain');
  expect(await thought.evaluate(element => getComputedStyle(element, '::after').display)).toBe('block');
  await expect(page.locator('[data-frame-id="impact"] .frame-content')).toHaveAttribute('data-sound-style', 'burst');
  const snapshot = await page.locator('.story-body').ariaSnapshot();
  for (const text of ['The lake had fallen silent.', "Mira: I've seen this place before.", 'Mira: But something is different now.', 'CRASH!', 'WHOOSH!']) expect(snapshot).toContain(text);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('root Beats bind to positioned geometry, retain labels and follow layout changes', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async id => {
    const moduleUrl = '/src/renderer/mount.ts';
    const { mountStory } = await import(/* @vite-ignore */ moduleUrl);
    const story = await (await fetch(`/stories/${id}/story.json`)).json();
    const root = document.querySelector<HTMLElement>('#app')!;
    root.classList.remove('landing-host');
    story.body.containers[0].flow.push({ type: 'space', height: '200svh' });
    story.body.containers[0].flow[0].frames[0].beat = { id: 'inline-arrival', align: 'center' };
    const handle = mountStory(root, story, { assetBaseUrl: `${location.origin}/stories/${id}/` });
    await handle.ready;
    const before = handle.beats.map((b: { id: string; label?: string; scrollY: number }) => ({ id: b.id, label: b.label, scrollY: b.scrollY }));
    const departure = root.querySelector('[data-frame-id="departure"] .frame-placement')!.getBoundingClientRect();
    const expected = departure.top + scrollY + (departure.height - innerHeight) / 2;
    const panel = root.querySelector<HTMLElement>('[data-panel-id="arrival-panel"]')!;
    panel.style.paddingBottom = '200px';
    handle.refreshBeats();
    const after = handle.beats.find((b: { id: string }) => b.id === 'departure-beat').scrollY;
    const recorded = { before, expected, after };
    handle.destroy();
    return recorded;
  }, english);
  expect(result.before.slice(0, 2).map((b: { id: string }) => b.id)).toEqual(['inline-arrival', 'arrival-beat']);
  const departure = result.before.find((b: { id: string }) => b.id === 'departure-beat')!;
  expect(departure.label).toBe('Departure');
  expect(departure.scrollY).toBeCloseTo(result.expected, 0);
  expect(result.after).toBeGreaterThan(departure.scrollY + 150);
});

test('intrinsic static Card settles at natural ratio and image failures keep a reserve', async ({ page }) => {
  await page.goto(`/s/${english}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  const card = page.locator('[data-frame-id="card"] .frame-content');
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => card.evaluate(el => parseFloat(getComputedStyle(el).aspectRatio))).toBeCloseTo(400 / 560, 2);
  await page.route(`**/stories/${english}/cards/lantern.svg`, route => route.abort());
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('img')).toHaveAttribute('data-asset-state', 'error');
  expect((await card.boundingBox())!.height).toBeGreaterThan(100);
});

test('Panel padding and borders participate in FIT layout without losing reverse or reduced motion', async ({ page }) => {
  await page.route(`**/stories/${cards}/story.json`, async route => {
    const response = await route.fetch(); const story = await response.json();
    const panel = story.body.containers[0].flow[0];
    panel.padding = 'medium'; panel.border = { color: '#123456', width: 'medium' }; panel.radius = 'medium';
    panel.frames[1].artwork.transition.scrollMode = 'flow';
    panel.frames.push({ type: 'narrative', text: 'Outside the Panel', flow: 'overflow', position: { anchor: 'bottom', y: '100px' } });
    delete story.body.containers[0].flow[2].frames[1].artwork;
    story.body.containers[0].flow.push({ type: 'space', height: '200svh' });
    await route.fulfill({ response, json: story });
  });
  await page.goto(`/s/${cards}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  const panel = page.locator('[data-panel-id="lunora-entry"]');
  const measure = () => panel.evaluate(el => {
    const p = el as HTMLElement; const rect = p.getBoundingClientRect();
    const previous = p.style.height; p.style.height = 'auto'; const natural = p.getBoundingClientRect().height; p.style.height = previous;
    return { height: rect.height, art: p.clientWidth / .846 / .704878 * .37 + 36, natural, end: rect.top + scrollY + natural, start: Math.max(0, rect.top + scrollY - innerHeight) };
  });
  await expect.poll(async () => Math.abs((await measure()).height - (await measure()).art)).toBeLessThan(1);
  const metrics = await measure();
  await page.evaluate(y => scrollTo(0, y), metrics.start + .45 * (metrics.end - metrics.start));
  await expect.poll(async () => Math.abs((await measure()).height - metrics.natural)).toBeLessThan(1);
  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(async () => Math.abs((await measure()).height - metrics.art)).toBeLessThan(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => Math.abs((await measure()).height - metrics.natural)).toBeLessThan(1);
});

test('reader runtime root loads an unchanged package from a separate origin', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/reader-config.json', route => route.fulfill({ json: { storyRoot: 'https://content.example.test/library/' } }));
  await page.route('https://content.example.test/library/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/library/', '/stories/');
    const response = await page.request.get(`http://127.0.0.1:5173${path}`);
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.goto(`/s/${english}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('[data-frame-id="reveal"] img')).toHaveAttribute('src', `https://content.example.test/library/${english}/assets/lantern.svg`);
  await expect(page.locator('h1')).toHaveText('The lantern crossing');
  expect(errors).toEqual([]);
});

for (const id of [english, arabic]) test(`V5 visual reference ${id}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/s/${id}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => page.locator('[data-frame-id="reveal"] img').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page).toHaveScreenshot(`v5-${id === english ? 'english' : 'arabic'}.png`, { animations: 'disabled' });
});

test('Panel spacing and alignment affect normal flow while overflow remains independent', async ({ page }) => {
  await page.route(`**/stories/${english}/story.json`, async route => {
    const response = await route.fetch(); const story = await response.json();
    const panel = story.body.containers[0].flow[0];
    panel.padding = 'medium'; panel.gap = 'large'; panel.align = 'end'; panel.radius = 'large'; panel.opacity = .9;
    panel.frames[0].position = { anchor: 'top-left', width: '50%' };
    panel.frames.push({ type: 'narrative', id: 'overflow', text: 'Beyond the edge', flow: 'overflow', position: { anchor: 'bottom', y: '20px', width: '50%' } });
    await route.fulfill({ response, json: story });
  });
  await page.goto(`/s/${english}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  const geometry = await page.locator('[data-panel-id="arrival-panel"]').evaluate(el => {
    const panel = el.getBoundingClientRect();
    const first = el.querySelector('[data-frame-id="arrival"] .frame-placement')!.getBoundingClientRect();
    const image = el.querySelector('[data-frame-id="reveal"] .frame-placement')!.getBoundingClientRect();
    const overflow = el.querySelector('[data-frame-id="overflow"] .frame-placement')!.getBoundingClientRect();
    return { gap: image.top - first.bottom, rightInset: panel.right - first.right, overflowBottom: overflow.bottom - panel.bottom };
  });
  expect(geometry.gap).toBeCloseTo(32, 0);
  expect(geometry.rightInset).toBeCloseTo(16, 0);
  expect(geometry.overflowBottom).toBeCloseTo(20, 0);
});

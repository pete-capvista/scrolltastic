import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';

const storyId = '77777777-7777-4777-8777-777777777777';
const challengeId = '11111111-1111-4111-8111-111111111111';
const challenge = 'a'.repeat(64);
const publicKey = 'b'.repeat(64);

async function enableAuthoring(page: import('@playwright/test').Page) {
  await page.route(`**/stories/${storyId}/story.json`, async route => {
    const response = await route.fetch(); const story = await response.json();
    story.authoring = { ai: { enabled: true } };
    await route.fulfill({ response, json: story });
  });
}

test('Nostr is the primary sign-in and binds the signer event to the one-time challenge', async ({ page }) => {
  let submitted: { proof: { challengeId: string; challenge: string }; event: { pubkey: string; tags: string[][] } } | undefined;
  await enableAuthoring(page);
  await page.addInitScript(({ publicKey }) => {
    (window as unknown as { nostr: unknown }).nostr = {
      getPublicKey: async () => publicKey,
      signEvent: async (event: object) => ({ ...event, id: 'c'.repeat(64), pubkey: publicKey, sig: 'd'.repeat(128) }),
    };
  }, { publicKey });
  await page.route(`**/api/stories/${storyId}/capabilities`, route => route.fulfill({ json: {
    authenticated: false, authoring: { canEdit: false, ai: { declared: true, canPrompt: false } }, actions: [],
  } }));
  await page.route('**/api/auth/nostr/challenge', route => route.fulfill({ status: 201, json: { challenge: {
    id: challengeId, challenge, expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: Math.floor(Date.now() / 1000),
    loginUrl: `${new URL(page.url()).origin}/api/auth/nostr/session`,
  } } }));
  await page.route('**/api/auth/nostr/session', async route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { authenticated: true, returnPath: `/s/${storyId}` } });
  });
  await page.goto(`/s/${storyId}`);
  const signIn = page.getByRole('button', { name: 'Sign in with Nostr' });
  await expect(signIn).toBeVisible();
  await signIn.click();
  await expect.poll(() => submitted).toBeTruthy();
  expect(submitted?.proof).toEqual({ challengeId, challenge });
  expect(submitted?.event.pubkey).toBe(publicKey);
  expect(submitted?.event.tags).toEqual([
    ['u', `${new URL(page.url()).origin}/api/auth/nostr/session`], ['method', 'POST'], ['challenge', challenge],
    ['payload', createHash('sha256').update(JSON.stringify({ challengeId, challenge })).digest('hex')],
  ]);
});

test('Nostr sign-in explains that a NIP-07 signer is required', async ({ page }) => {
  await enableAuthoring(page);
  await page.route(`**/api/stories/${storyId}/capabilities`, route => route.fulfill({ json: {
    authenticated: false, authoring: { canEdit: false, ai: { declared: true, canPrompt: false } }, actions: [],
  } }));
  await page.goto(`/s/${storyId}`);
  await page.getByRole('button', { name: 'Sign in with Nostr' }).click();
  await expect(page.getByRole('status')).toContainText('NIP-07 Nostr signer');
});

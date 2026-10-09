import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const storyId = '77777777-7777-4777-8777-777777777777';
const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const revisionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const story = JSON.parse(readFileSync(`public/stories/${storyId}/story.json`, 'utf8'));

test('exact draft preview provides non-invasive selection and reviewed commit controls', async ({ page }) => {
  let documentNavigations = 0;
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) documentNavigations += 1;
  });
  let acknowledged = false;
  let asked = false;
  let assistantMode: string | undefined;
  let assistantAssetIds: string[] | undefined;
  let reviewedMemory = false;
  let accepted = false;
  await page.route('**/api/stories/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname.endsWith('/capabilities')) return route.fulfill({ json: { authenticated: true, authoring: { canEdit: true, ai: { declared: true, canPrompt: true } }, actions: ['story:edit', 'story:prompt-ai', 'story:publish'] } });
    if (url.pathname.endsWith('/operations')) return route.fulfill({ json: { operations: { usage: { tokens: 42, cost: 0.01 }, openMaintenanceFailures: 0, generations: [] } } });
    if (url.pathname.endsWith('/review')) { reviewedMemory = true; return route.fulfill({ json: { memory: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', status: 'approved' } } }); }
    if (url.pathname.endsWith('/memory')) return route.fulfill({ json: { memory: reviewedMemory ? [] : [{
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', category: 'canon', value: { name: 'Mara' }, confidence: 0.9,
      status: 'proposed', provenance: { evidence: 'voices', reason: 'Continuity' },
    }] } });
    return route.abort();
  });
  await page.route('**/api/conversations/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/messages')) return route.fulfill({ json: { messages: asked ? [
      { id: '1', sequence: 0, role: 'user', parts: [{ type: 'text', text: 'What is selected?' }], generationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
      { id: '2', sequence: 1, role: 'assistant', parts: [{ type: 'text', text: 'The voices Panel is selected.' }], generationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    ] : [] } });
    if (url.pathname.endsWith('/generations')) { asked = true; const body = route.request().postDataJSON(); assistantMode = body.mode; assistantAssetIds = body.selectedAssetIds; return route.fulfill({ status: 202, json: { generation: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'pending' } } }); }
    return route.abort();
  });
  await page.route('**/api/generations/**', route => route.fulfill({ json: { generation: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'completed', output: { text: 'The voices Panel is selected.', workingDraftUpdated: true } } } }));
  await page.route('**/api/workspaces/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname.endsWith('/package/story.json')) return route.fulfill({ json: story });
    if (url.pathname.endsWith('/assets')) return route.fulfill({ json: { assets: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', logicalPath: 'assets/race.png', mediaType: 'image/png', bytes: 10, width: 100, height: 50, digest: 'a'.repeat(64) }] } });
    if (url.pathname.endsWith('/conversations')) return route.fulfill({ status: 201, json: { conversation: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' } } });
    if (url.pathname.endsWith('/revisions')) return route.fulfill({ json: { revisions: [{ id: revisionId, digest: 'a'.repeat(64), createdAt: new Date().toISOString(), operations: null }] } });
    if (url.pathname.endsWith('/preview-ack')) { acknowledged = true; return route.fulfill({ status: 204 }); }
    if (url.pathname.endsWith('/accept')) { accepted = true; return route.fulfill({ status: 201, json: { revisionId } }); }
    if (url.pathname.endsWith('/commit')) return route.fulfill({ json: { readerUrl: `/s/${storyId}` } });
    if (url.pathname.endsWith(`/${workspaceId}`)) return route.fulfill({ json: { workspace: { id: workspaceId, storyId, currentRevisionId: revisionId, hasPendingChanges: asked && !accepted, status: 'active' } } });
    return route.abort();
  });
  await page.goto(`/s/${storyId}/edit/${workspaceId}/r/${revisionId}`);
  await expect(page.locator('#editor-shell')).toBeVisible();
  await page.getByRole('button', { name: 'View story' }).click();
  await expect(page.locator('#editor-shell')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Edit story' })).toBeVisible();
  await expect(page.locator('[data-panel-id="voices"]')).toBeVisible();
  await page.getByRole('button', { name: 'Edit story' }).click();
  await expect(page.locator('#editor-shell')).toBeVisible();
  await page.getByText('Advanced', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Draft assets' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload image' })).toBeVisible();
  await expect(page.locator('[data-panel-id="voices"]')).toBeVisible();
  await page.locator('[data-panel-id="voices"]').click({ position: { x: 8, y: 8 } });
  await expect(page.locator('.editor-selection-marker')).toBeVisible();
  await expect(page.getByText('Context: Panel voices')).toBeVisible();
  const composer = page.getByLabel('Message the story assistant');
  await expect(composer).toBeEnabled();
  await composer.fill('help');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/publish — prepare/)).toBeVisible();
  await composer.fill('list assets');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByLabel('Select assets/race.png').check();
  await expect(page.getByText('Context: Panel voices · 1 asset')).toBeVisible();
  await composer.fill('What is selected?');
  await page.getByRole('button', { name: 'Send' }).click();
  expect(assistantMode).toBe('assist');
  expect(assistantAssetIds).toEqual(['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee']);
  await expect(page.getByText('The voices Panel is selected.')).toBeVisible();
  await expect(page.getByText('Context: Panel voices · 1 asset')).toBeVisible();
  expect(documentNavigations).toBe(1);
  await composer.fill('accept');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => accepted).toBe(true);
  await expect(page.getByText('Context: Panel voices · 1 asset')).toBeVisible();
  await composer.fill('publish');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Review this exact preview/)).toBeVisible();
  await page.getByRole('button', { name: 'Review proposals' }).click();
  await expect(page.getByText(/Mara/)).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).focus();
  await page.keyboard.press('Enter');
  expect(reviewedMemory).toBe(true);
  await expect(page.getByText('No memory proposals awaiting review.')).toBeVisible();
  await page.getByRole('button', { name: 'View operations' }).click();
  await expect(page.getByRole('status')).toContainText('42 tokens');
  const commit = page.getByRole('button', { name: 'Approve and publish' });
  await expect(commit).toBeDisabled();
  await page.getByRole('button', { name: 'Mark preview reviewed' }).click();
  expect(acknowledged).toBe(true);
  await expect(commit).toBeEnabled();
  await commit.click();
  await expect(page).toHaveURL(`/s/${storyId}`);
});

const STORY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function storyIdentity(document) {
  if (!document || document.uri.path.split('/').pop() !== 'story.json' || document.languageId !== 'json') {
    throw new Error('Open a V5 story.json file to create a share link.');
  }
  let story;
  try { story = JSON.parse(document.getText()); }
  catch { throw new Error('story.json must contain valid JSON.'); }
  if (!story || story.storyLanguage !== '5' || typeof story.id !== 'string' || !STORY_ID.test(story.id)) {
    throw new Error('Sharing requires a V5 story with a valid UUID.');
  }
  return { id: story.id, title: typeof story.title === 'string' && story.title.trim() ? story.title : 'Untitled story' };
}

async function responseJson(response) {
  const value = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(value?.error?.message ?? `Sharing failed with HTTP ${response.status}.`);
  return value;
}

async function requestJson(url, token, origin, method = 'POST', body) {
  return responseJson(await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      origin,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
}

async function createShareLink(vscode, document, apiBase) {
  if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before creating a share link.');
  const story = storyIdentity(document);
  if (document.isDirty) {
    const choice = await vscode.window.showWarningMessage(
      'The share link uses the current accepted server revision. Unsaved and local-only edits are not included.',
      { modal: true }, 'Continue',
    );
    if (choice !== 'Continue') return;
  }
  const session = await vscode.authentication.getSession('github', ['read:user'], { createIfNone: true });
  if (!session) throw new Error('Sign in with GitHub to create a share link.');
  const authorization = session.accessToken;
  const { workspace } = await requestJson(`${apiBase}/api/stories/${story.id}/workspaces`, authorization, apiBase);
  if (!workspace?.id || !workspace.currentRevisionId) throw new Error('The current server revision is unavailable.');
  const { share } = await requestJson(
    `${apiBase}/api/workspaces/${workspace.id}/revisions/${workspace.currentRevisionId}/shares`,
    authorization, apiBase, 'POST', {},
  );
  if (!share?.id || !share.url || !share.expiresAt) throw new Error('The sharing service returned an invalid response.');
  await vscode.env.clipboard.writeText(share.url);
  const action = await vscode.window.showInformationMessage(
    `Copied a share link for “${story.title}”. It expires ${new Date(share.expiresAt).toLocaleString()}.`,
    'Open Shared Story', 'Revoke Link',
  );
  if (action === 'Open Shared Story') await vscode.env.openExternal(vscode.Uri.parse(share.url));
  else if (action === 'Revoke Link') {
    await requestJson(`${apiBase}/api/shares/${share.id}`, authorization, apiBase, 'DELETE');
    void vscode.window.showInformationMessage('The share link was revoked.');
  }
  return share;
}

module.exports = { createShareLink, storyIdentity };

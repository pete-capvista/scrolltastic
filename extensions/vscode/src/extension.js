const vscode = require('vscode');
const { randomBytes, randomUUID } = require('node:crypto');
const path = require('node:path');
const { realpath } = require('node:fs/promises');
const { collectStoryAssetPaths, isStoryAssetPath } = require('./package-path');
const { publishStory } = require('./publisher');

const TEXT_DEBOUNCE = 300;
const ASSET_DEBOUNCE = 150;
const PREVIEW_TITLE = 'Scrolltastic Preview';
const sessions = new Map();

function isStoryDocument(document) {
  return document && document.uri.path.split('/').pop() === 'story.json' && document.languageId === 'json';
}

function createWebviewHtml(webview, extensionUri) {
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'main.js'));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'main.css'));
  const nonce = randomBytes(24).toString('base64');
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; font-src ${webview.cspSource}; connect-src 'none'; base-uri 'none'; form-action 'none';">
<link rel="stylesheet" href="${style}"></head><body><main id="story-root" aria-live="polite"></main>
<script nonce="${nonce}" type="module" src="${script}"></script></body></html>`;
}

function getOpenDocument(uri) {
  return vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
}

function createSession(document, extensionUri) {
  const root = vscode.Uri.joinPath(document.uri, '..');
  const panel = vscode.window.createWebviewPanel(
    'scrolltastic.preview', PREVIEW_TITLE, vscode.ViewColumn.Beside,
    { enableScripts: true, localResourceRoots: [root, vscode.Uri.joinPath(extensionUri, 'dist')], retainContextWhenHidden: false },
  );
  const session = {
    uri: document.uri, root, panel, revision: 0, requestToken: 0, timer: undefined, assetTimer: undefined,
    paused: false, latestText: document.getText(), sentText: undefined, disposed: false,
    watchers: [], status: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 80),
    subscriptions: [],
  };
  session.status.text = '$(sync~spin) Scrolltastic preview';
  session.status.show();
  panel.webview.html = createWebviewHtml(panel.webview, extensionUri);
  session.subscriptions.push(panel.onDidDispose(() => disposeSession(session)));
  session.subscriptions.push(panel.onDidChangeViewState(event => {
    if (event.webviewPanel.visible) scheduleUpdate(session, 0, true);
  }));
  session.subscriptions.push(panel.webview.onDidReceiveMessage(message => handlePreviewMessage(session, message)));
  for (const pattern of ['story.json', 'assets/**', 'cards/**']) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, pattern));
    watcher.onDidChange(uri => handlePackageChange(session, uri));
    watcher.onDidCreate(uri => handlePackageChange(session, uri));
    watcher.onDidDelete(uri => handlePackageChange(session, uri));
    session.watchers.push(watcher);
  }
  return session;
}

function openPreview(document, extensionUri) {
  if (!isStoryDocument(document)) {
    void vscode.window.showErrorMessage('Open a V5 story.json file to preview a Scrolltastic story.');
    return;
  }
  const key = document.uri.toString();
  let session = sessions.get(key);
  if (!session || session.disposed) {
    session = createSession(document, extensionUri);
    sessions.set(key, session);
  }
  session.panel.reveal(vscode.ViewColumn.Beside);
  scheduleUpdate(session, 0, true);
}

function scheduleUpdate(session, delay = TEXT_DEBOUNCE, force = false) {
  if (session.disposed) return;
  clearTimeout(session.timer);
  session.timer = setTimeout(() => {
    session.timer = undefined;
    void updateSession(session, force);
  }, delay);
}

function handlePackageChange(session, changedUri) {
  if (session.disposed) return;
  if (changedUri.toString() === session.uri.toString()) {
    const open = getOpenDocument(session.uri);
    if (open) {
      session.latestText = open.getText();
      scheduleUpdate(session, 0);
    } else {
      void readStoryText(session).then(text => { session.latestText = text; scheduleUpdate(session, 0); }).catch(error => setStatus(session, `Story file unavailable: ${error.message}`));
    }
    return;
  }
  clearTimeout(session.assetTimer);
  session.assetTimer = setTimeout(() => scheduleUpdate(session, 0, true), vscode.workspace.getConfiguration('scrolltastic').get('preview.assetDebounceMs', ASSET_DEBOUNCE));
}

async function readStoryText(session) {
  const open = getOpenDocument(session.uri);
  if (open) return open.getText();
  return Buffer.from(await vscode.workspace.fs.readFile(session.uri)).toString('utf8');
}

async function updateSession(session, force) {
  if (session.disposed) return;
  const requestToken = ++session.requestToken;
  let text;
  try { text = await readStoryText(session); }
  catch (error) { setStatus(session, `Story file unavailable: ${error.message}`); return; }
  if (session.disposed || requestToken !== session.requestToken) return;
  session.latestText = text;
  if (!force && text === session.sentText) return;
  if (session.paused) {
    setStatus(session, '$(debug-pause) Preview paused · latest edit waiting');
    return;
  }
  const revision = ++session.revision;
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { parsed = undefined; }
  const references = collectStoryAssetPaths(parsed);
  const assets = {};
  const missingAssets = [];
  const blockedAssets = [];
  let realPackageRoot;
  if (session.root.scheme === 'file') {
    try { realPackageRoot = await realpath(session.root.fsPath); }
    catch { realPackageRoot = undefined; }
  }
  for (const reference of references) {
    if (session.disposed || requestToken !== session.requestToken) return;
    const assetUri = vscode.Uri.joinPath(session.root, ...reference.split('/'));
    let exists = true;
    try { await vscode.workspace.fs.stat(assetUri); }
    catch { exists = false; missingAssets.push(reference); }
    if (exists && realPackageRoot) {
      try {
        const actualPath = await realpath(assetUri.fsPath);
        const relative = path.relative(realPackageRoot, actualPath);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          blockedAssets.push(reference);
          continue;
        }
      } catch { /* The filesystem provider may be completing a copy; normal image loading reports it. */ }
    }
    const webviewUri = session.panel.webview.asWebviewUri(assetUri);
    assets[reference] = webviewUri.with({ query: `revision=${revision}` }).toString();
  }
  if (session.disposed || requestToken !== session.requestToken) return;
  session.sentText = text;
  setStatus(session, '$(sync~spin) Updating preview');
  await session.panel.webview.postMessage({ type: 'render', revision, text, assets, missingAssets, blockedAssets, scrollY: session.scrollY ?? 0 });
  session.pendingMissingAssets = missingAssets;
}

function handlePreviewMessage(session, message) {
  if (session.disposed || !message || typeof message.type !== 'string') return;
  if (message.type === 'ready') {
    scheduleUpdate(session, 0, true);
  } else if (message.type === 'rendered' && message.revision === session.revision) {
    const warnings = session.pendingMissingAssets?.length ? ` · missing: ${session.pendingMissingAssets.join(', ')}` : '';
    setStatus(session, `$(eye) Preview ${message.width}×${message.height}${warnings}`);
  } else if (message.type === 'invalid' && message.revision === session.revision) {
    const issue = typeof message.message === 'string' ? message.message.slice(0, 240) : 'Invalid story JSON';
    setStatus(session, `$(warning) Preview stale · ${issue}`);
  } else if (message.type === 'error' && message.revision === session.revision) {
    setStatus(session, `$(error) Preview failed · ${String(message.message ?? 'unknown error')}`);
  } else if (message.type === 'position' && message.revision === session.revision) {
    session.scrollY = Number.isFinite(message.scrollY) ? message.scrollY : 0;
  } else if (message.type === 'viewport' && Number.isFinite(message.width) && Number.isFinite(message.height)) {
    setStatus(session, `$(eye) Preview ${message.width}×${message.height}`);
  }
}

function setStatus(session, text) {
  session.status.text = text;
  session.status.show();
}

function disposeSession(session) {
  if (session.disposed) return;
  session.disposed = true;
  clearTimeout(session.timer);
  clearTimeout(session.assetTimer);
  session.watchers.forEach(watcher => watcher.dispose());
  session.subscriptions.forEach(subscription => subscription.dispose());
  session.status.dispose();
  sessions.delete(session.uri.toString());
}

function currentSession(document) {
  if (!isStoryDocument(document)) return undefined;
  return sessions.get(document.uri.toString());
}

function registerCommand(context, id, callback) {
  context.subscriptions.push(vscode.commands.registerCommand(id, callback));
}

function activate(context) {
  const extensionUri = context.extensionUri;
  const publishOutput = vscode.window.createOutputChannel('Scrolltastic Publish');
  context.subscriptions.push(publishOutput);
  registerCommand(context, 'scrolltastic.newStory', async () => {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage('Trust this workspace before creating a Scrolltastic story package.');
      return;
    }
    const selected = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Create story here' });
    if (!selected?.[0]) return;
    const parent = selected[0];
    let folder;
    do { folder = vscode.Uri.joinPath(parent, `story-${randomUUID()}`); }
    while (await vscode.workspace.fs.stat(folder).then(() => true, () => false));
    const story = {
      storyLanguage: '5', id: randomUUID(), title: 'Untitled story', language: 'en',
      body: { containers: [{ type: 'container', id: 'story', flow: [{ type: 'panel', id: 'opening', height: { mode: 'content' }, frames: [{ type: 'narrative', text: 'Your story begins here.' }] }] }] },
    };
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder, 'assets'));
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder, 'cards'));
    const storyUri = vscode.Uri.joinPath(folder, 'story.json');
    await vscode.workspace.fs.writeFile(storyUri, Buffer.from(`${JSON.stringify(story, null, 2)}\n`));
    const document = await vscode.workspace.openTextDocument(storyUri);
    await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
    openPreview(document, extensionUri);
  });
  registerCommand(context, 'scrolltastic.publishStory', async () => {
    try { await publishStory(vscode, context, vscode.window.activeTextEditor?.document, publishOutput); }
    catch (error) {
      publishOutput.appendLine(`[${new Date().toISOString()}] Publish failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'The story could not be published.');
    }
  });
  registerCommand(context, 'scrolltastic.openPreview', () => openPreview(vscode.window.activeTextEditor?.document, extensionUri));
  registerCommand(context, 'scrolltastic.refreshPreview', () => {
    const session = currentSession(vscode.window.activeTextEditor?.document);
    if (session) scheduleUpdate(session, 0, true);
    else openPreview(vscode.window.activeTextEditor?.document, extensionUri);
  });
  registerCommand(context, 'scrolltastic.togglePause', () => {
    const session = currentSession(vscode.window.activeTextEditor?.document);
    if (!session) return openPreview(vscode.window.activeTextEditor?.document, extensionUri);
    session.paused = !session.paused;
    if (session.paused) setStatus(session, '$(debug-pause) Preview paused');
    else scheduleUpdate(session, 0, true);
  });
  registerCommand(context, 'scrolltastic.restartPreview', () => {
    const session = currentSession(vscode.window.activeTextEditor?.document);
    if (session) {
      session.scrollY = 0;
      session.panel.webview.postMessage({ type: 'restart', revision: session.revision });
    }
  });
  registerCommand(context, 'scrolltastic.copyAssetReference', async selected => {
    const document = vscode.window.activeTextEditor?.document;
    if (!isStoryDocument(document) || !selected) return;
    const root = vscode.Uri.joinPath(document.uri, '..');
    if (selected.scheme !== root.scheme || !selected.path.startsWith(`${root.path}/`)) return;
    const relative = selected.path.slice(root.path.length + 1);
    if (!isStoryAssetPath(relative)) {
      void vscode.window.showWarningMessage('Story assets need a safe filename in assets/ or cards/ and an SVG, PNG, JPEG, WebP or AVIF extension.');
      return;
    }
    await vscode.env.clipboard.writeText(relative);
    void vscode.window.setStatusBarMessage(`Copied ${relative}`, 2500);
  });

  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
    const session = sessions.get(event.document.uri.toString());
    if (session) scheduleUpdate(session, vscode.workspace.getConfiguration('scrolltastic').get('preview.debounceMs', TEXT_DEBOUNCE));
  }));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
    const session = sessions.get(document.uri.toString());
    if (session) scheduleUpdate(session, 0);
  }));
  context.subscriptions.push({ dispose: () => [...sessions.values()].forEach(disposeSession) });
}

function deactivate() {
  [...sessions.values()].forEach(disposeSession);
}

module.exports = { activate, deactivate };

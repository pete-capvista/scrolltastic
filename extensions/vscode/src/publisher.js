const { createHash } = require('node:crypto');
const path = require('node:path');
const { realpath } = require('node:fs/promises');
const { upload } = require('@vercel/blob/client');
const { collectStoryAssetPaths, isStoryAssetPath } = require('./package-path');

const STORY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_FILES = 256;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;

function contentTypeForPath(pathname) {
  if (pathname === 'story.json') return 'application/json';
  return { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif' }[pathname.split('.').pop()];
}

function manifestEntry(pathname, bytes) {
  const contentType = contentTypeForPath(pathname);
  if (!contentType || (pathname !== 'story.json' && !isStoryAssetPath(pathname))) throw new Error(`Invalid package path: ${pathname}`);
  if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) throw new Error(`${pathname} must be between 1 byte and 25 MiB.`);
  return { path: pathname, size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), contentType };
}

async function collectPackage(vscode, document) {
  const { validateStoryForPublish } = require('../dist/validator.cjs');
  if (document.isDirty && !await document.save()) throw new Error('Save story.json before publishing.');
  const root = vscode.Uri.joinPath(document.uri, '..');
  if (root.scheme !== 'file') throw new Error('Publishing requires a local folder-backed story package.');
  const storyBytes = Buffer.from(await vscode.workspace.fs.readFile(document.uri));
  let story;
  try { story = JSON.parse(storyBytes.toString('utf8')); }
  catch { throw new Error('story.json must contain valid JSON.'); }
  if (!story || typeof story !== 'object' || story.storyLanguage !== '5' || typeof story.id !== 'string' || !STORY_ID.test(story.id)) {
    throw new Error('Publishing requires a V5 story with a valid UUID.');
  }
  const validation = validateStoryForPublish(storyBytes.toString('utf8'));
  if (!validation.valid) throw new Error(validation.diagnostics.find(issue => issue.severity === 'error')?.message ?? 'The story is invalid.');
  const references = collectStoryAssetPaths(story).sort();
  const referenceSet = new Set(references);
  for (const open of vscode.workspace.textDocuments) {
    if (!open.isDirty || open.uri.scheme !== root.scheme || !open.uri.path.startsWith(`${root.path}/`)) continue;
    const relative = open.uri.path.slice(root.path.length + 1);
    if (referenceSet.has(relative) && !await open.save()) throw new Error(`Save ${relative} before publishing.`);
  }
  const files = [{ path: 'story.json', bytes: storyBytes, manifest: manifestEntry('story.json', storyBytes) }];
  const packageRoot = await realpath(root.fsPath);
  for (const reference of references) {
    const uri = vscode.Uri.joinPath(root, ...reference.split('/'));
    let actual;
    try { actual = await realpath(uri.fsPath); }
    catch { throw new Error(`Referenced asset is missing: ${reference}`); }
    const relative = path.relative(packageRoot, actual);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Referenced asset escapes the story package: ${reference}`);
    const bytes = Buffer.from(await vscode.workspace.fs.readFile(uri));
    files.push({ path: reference, bytes, manifest: manifestEntry(reference, bytes) });
  }
  if (files.length > MAX_FILES) throw new Error(`A story package may contain at most ${MAX_FILES} published files.`);
  const total = files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
  if (total > MAX_PACKAGE_BYTES) throw new Error('The story package is larger than 100 MiB.');
  const unreferenced = [];
  async function inspect(directory, prefix) {
    let entries;
    try { entries = await vscode.workspace.fs.readDirectory(directory); } catch { return; }
    for (const [name, type] of entries) {
      const relative = `${prefix}/${name}`;
      const uri = vscode.Uri.joinPath(directory, name);
      if (type === vscode.FileType.Directory) await inspect(uri, relative);
      else if (isStoryAssetPath(relative) && !referenceSet.has(relative)) unreferenced.push(relative);
    }
  }
  await inspect(vscode.Uri.joinPath(root, 'assets'), 'assets');
  await inspect(vscode.Uri.joinPath(root, 'cards'), 'cards');
  return { story, files, total, diagnostics: validation.diagnostics, unreferenced: unreferenced.sort() };
}

async function responseJson(response) {
  const value = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = new Error(value?.error?.message ?? `Publishing failed with HTTP ${response.status}.`);
    error.code = value?.error?.code;
    throw error;
  }
  return value;
}

async function postJson(url, token, body) {
  return responseJson(await fetch(url, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
}

function publishingApiBase(vscode) {
  const inspected = vscode.workspace.getConfiguration('scrolltastic').inspect('publish.apiBaseUrl');
  const configured = inspected?.globalValue ?? inspected?.defaultValue ?? 'https://scrolltastic.vercel.app';
  let url;
  try { url = new URL(configured); } catch { throw new Error('The publishing API URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('The publishing API must be an HTTPS origin configured in your user settings.');
  }
  return url.origin;
}

async function publishStory(vscode, context, document, output, allowOverwrite = false) {
  if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before publishing a story.');
  if (!document || document.uri.path.split('/').pop() !== 'story.json' || document.languageId !== 'json') throw new Error('Open a V5 story.json file to publish.');
  const packageData = await collectPackage(vscode, document);
  const warnings = packageData.diagnostics.filter(issue => issue.severity !== 'error');
  if (warnings.length || packageData.unreferenced.length) {
    const details = [
      ...warnings.map(issue => `${issue.path || '/'}: ${issue.message}`),
      ...packageData.unreferenced.map(file => `Not published because it is unreferenced: ${file}`),
    ];
    output.appendLine(`[${new Date().toISOString()}] Publish preflight for ${packageData.story.title}`);
    details.forEach(detail => output.appendLine(`  ${detail}`));
    const choice = await vscode.window.showWarningMessage(
      `Publish with ${warnings.length} warning${warnings.length === 1 ? '' : 's'} and ${packageData.unreferenced.length} unreferenced file${packageData.unreferenced.length === 1 ? '' : 's'} excluded?`,
      { modal: true, detail: details.slice(0, 8).join('\n') }, 'Publish', 'View Output',
    );
    if (choice === 'View Output') output.show(true);
    if (choice !== 'Publish') return;
  }
  const session = await vscode.authentication.getSession('github', ['read:user'], { createIfNone: true });
  if (!session) throw new Error('Sign in with GitHub to publish.');
  const apiBase = publishingApiBase(vscode);
  const revisionKey = `scrolltastic.publishRevision.${packageData.story.id}`;
  const rememberedRevision = allowOverwrite ? undefined : context.globalState.get(revisionKey);
  let prepared;
  try {
    prepared = await postJson(`${apiBase}/api/publish/prepare`, session.accessToken, {
      storyId: packageData.story.id,
      baseRevision: rememberedRevision ?? null,
      force: allowOverwrite,
      files: packageData.files.map(file => file.manifest),
    });
  } catch (error) {
    if (error.code === 'revision_conflict' && !allowOverwrite) {
      const choice = await vscode.window.showWarningMessage(error.message, { modal: true }, 'Publish Anyway');
      if (choice === 'Publish Anyway') return publishStory(vscode, context, document, output, true);
      return;
    }
    throw error;
  }
  const prefix = `_staging/${prepared.publisher}/${prepared.publishId}/${packageData.story.id}/`;
  const authorization = `Bearer ${session.accessToken}`;
  let uploaded = 0;
  const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Publishing ${packageData.story.title}`, cancellable: true }, async (progress, cancellation) => {
    const abort = new AbortController();
    cancellation.onCancellationRequested(() => abort.abort());
    const storyFile = packageData.files.find(file => file.path === 'story.json');
    const ordered = [...packageData.files.filter(file => file.path !== 'story.json'), storyFile];
    for (const file of ordered) {
      progress.report({ message: `Uploading ${file.path}`, increment: file.bytes.byteLength / packageData.total * 70 });
      await upload(`${prefix}${file.path}`, file.bytes, {
        access: 'public', handleUploadUrl: `${apiBase}/api/publish/upload`, headers: { authorization },
        clientPayload: JSON.stringify({ uploadTicket: prepared.uploadTickets[file.path] }),
        contentType: file.manifest.contentType, multipart: file.bytes.byteLength >= 5 * 1024 * 1024, abortSignal: abort.signal,
      });
      uploaded++;
    }
    progress.report({ message: 'Validating and publishing', increment: 20 });
    return postJson(`${apiBase}/api/publish/commit`, session.accessToken, {
      publishTicket: prepared.publishTicket,
      files: packageData.files.map(file => file.manifest),
    });
  });
  if (!result) return;
  await context.globalState.update(revisionKey, result.revision);
  output.appendLine(`[${new Date().toISOString()}] Published ${packageData.story.title}`);
  output.appendLine(`Story: ${result.readerUrl}`);
  output.appendLine(`Release: ${result.releaseId} · ${result.files} files · ${result.bytes} bytes`);
  output.appendLine(`Uploaded: ${uploaded} files; Blob updates may take up to one minute to propagate.`);
  const action = await vscode.window.showInformationMessage(`Published “${packageData.story.title}”. Updates may take up to a minute to appear.`, 'Open Published Story', 'Copy Story Link', 'View Output');
  if (action === 'Open Published Story') await vscode.env.openExternal(vscode.Uri.parse(result.readerUrl));
  else if (action === 'Copy Story Link') await vscode.env.clipboard.writeText(result.readerUrl);
  else if (action === 'View Output') output.show(true);
}

module.exports = { collectPackage, contentTypeForPath, manifestEntry, publishingApiBase, publishStory };

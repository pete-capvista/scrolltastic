const { randomUUID } = require('node:crypto');
const { collectStoryAssetPaths } = require('./package-path');
const { collectArchiveEntries, createZip } = require('./archive');

const STORY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;

function downloadStoryRoot(vscode) {
  const inspected = vscode.workspace.getConfiguration('scrolltastic').inspect('download.storyRootUrl');
  const configured = inspected?.globalValue ?? inspected?.defaultValue ?? 'https://scrolltastic.vercel.app/stories/';
  let url;
  try { url = new URL(configured); } catch { throw new Error('The live story URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || !url.pathname.endsWith('/') || url.search || url.hash) {
    throw new Error('The live story root must be an HTTPS directory URL configured in your user settings.');
  }
  return url.href;
}

function storyIdFromInput(value) {
  const input = value?.trim() ?? '';
  if (STORY_ID.test(input)) return input;
  try {
    const url = new URL(input);
    const match = url.pathname.match(/\/s\/([0-9a-f-]+)\/?$/);
    if (url.protocol === 'https:' && match && STORY_ID.test(match[1])) return match[1];
  } catch { /* A plain invalid identifier is handled below. */ }
  throw new Error('Enter a V5 story UUID or a published Scrolltastic story URL.');
}

async function fetchBytes(url, expected, fetcher) {
  const response = await fetcher(url, { credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new Error(response.status === 404 ? 'The live story is unavailable.' : `The live story could not be downloaded (HTTP ${response.status}).`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) throw new Error(`${expected} is larger than 25 MiB.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error(`${expected} must be between 1 byte and 25 MiB.`);
  return bytes;
}

async function fetchLivePackage(vscode, storyId, fetcher = fetch) {
  const packageUrl = new URL(`${storyId}/`, downloadStoryRoot(vscode));
  const storyUrl = new URL('story.json', packageUrl);
  const storyBytes = await fetchBytes(storyUrl, 'story.json', fetcher);
  let story;
  try { story = JSON.parse(storyBytes.toString('utf8')); } catch { throw new Error('The live story.json is not valid JSON.'); }
  if (!story || story.storyLanguage !== '5' || story.id !== storyId) throw new Error('The live package does not match this V5 story ID.');
  const { validateStoryForPublish } = require('../dist/validator.cjs');
  const validation = validateStoryForPublish(storyBytes.toString('utf8'));
  if (!validation.valid) throw new Error(validation.diagnostics.find(issue => issue.severity === 'error')?.message ?? 'The live story is invalid.');
  const files = [{ path: 'story.json', bytes: storyBytes }];
  let total = storyBytes.length;
  for (const reference of collectStoryAssetPaths(story).sort()) {
    const assetUrl = new URL(reference.split('/').map(encodeURIComponent).join('/'), packageUrl);
    const bytes = await fetchBytes(assetUrl, reference, fetcher);
    total += bytes.length;
    if (total > MAX_PACKAGE_BYTES) throw new Error('The live story package is larger than 100 MiB.');
    files.push({ path: reference, bytes });
  }
  return { story, files, total };
}

function archiveFilename(folderName, now) {
  return `${folderName}-${now.toISOString().replace(/[:.]/g, '-')}.zip`;
}

async function exists(vscode, uri) {
  return vscode.workspace.fs.stat(uri).then(() => true, () => false);
}

async function downloadLiveStory(vscode, document, output) {
  if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before downloading a live story.');
  let suggested = '';
  if (document?.uri?.path.split('/').pop() === 'story.json') {
    try { suggested = JSON.parse(document.getText()).id ?? ''; } catch { /* Prompt without a default. */ }
  }
  const input = await vscode.window.showInputBox({
    title: 'Download Live Scrolltastic Story', prompt: 'Enter the story UUID or published story URL', value: suggested,
    validateInput: value => { try { storyIdFromInput(value); return undefined; } catch (error) { return error.message; } },
  });
  if (input === undefined) return;
  const storyId = storyIdFromInput(input);
  const selected = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Download story here' });
  if (!selected?.[0]) return;
  const parent = selected[0];
  if (parent.scheme !== 'file') throw new Error('Downloading requires a local folder.');
  const destination = vscode.Uri.joinPath(parent, storyId);
  const destinationExists = await exists(vscode, destination);
  if (destinationExists) {
    const choice = await vscode.window.showWarningMessage(
      `The folder “${storyId}” already exists. Archive it as a ZIP, then replace it with the current live version?`,
      { modal: true }, 'Archive and Replace',
    );
    if (choice !== 'Archive and Replace') return;
  }
  const packageData = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Downloading live Scrolltastic story', cancellable: false },
    async progress => {
      progress.report({ message: 'Fetching story and assets' });
      return fetchLivePackage(vscode, storyId);
    },
  );
  const staging = vscode.Uri.joinPath(parent, `.scrolltastic-download-${randomUUID()}`);
  let archived;
  try {
    await vscode.workspace.fs.createDirectory(staging);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(staging, 'assets'));
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(staging, 'cards'));
    for (const file of packageData.files) {
      const uri = vscode.Uri.joinPath(staging, ...file.path.split('/'));
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
      await vscode.workspace.fs.writeFile(uri, file.bytes);
    }
    if (destinationExists) {
      const archiveDirectory = vscode.Uri.joinPath(parent, 'archive');
      await vscode.workspace.fs.createDirectory(archiveDirectory);
      let archiveName = archiveFilename(storyId, new Date());
      let archiveUri = vscode.Uri.joinPath(archiveDirectory, archiveName);
      for (let suffix = 2; await exists(vscode, archiveUri); suffix++) {
        archiveName = archiveFilename(storyId, new Date()).replace(/\.zip$/, `-${suffix}.zip`);
        archiveUri = vscode.Uri.joinPath(archiveDirectory, archiveName);
      }
      const entries = await collectArchiveEntries(vscode, destination);
      await vscode.workspace.fs.writeFile(archiveUri, createZip(entries));
      archived = archiveUri;
      await vscode.workspace.fs.delete(destination, { recursive: true, useTrash: false });
    }
    await vscode.workspace.fs.rename(staging, destination, { overwrite: false });
  } catch (error) {
    if (await exists(vscode, staging)) await vscode.workspace.fs.delete(staging, { recursive: true, useTrash: false });
    throw error;
  }
  const storyUri = vscode.Uri.joinPath(destination, 'story.json');
  const opened = await vscode.workspace.openTextDocument(storyUri);
  await vscode.window.showTextDocument(opened, vscode.ViewColumn.One);
  output.appendLine(`[${new Date().toISOString()}] Downloaded ${packageData.story.title} to ${destination.fsPath}`);
  if (archived) output.appendLine(`Archived previous folder to ${archived.fsPath}`);
  void vscode.window.showInformationMessage(`Downloaded “${packageData.story.title}”.${archived ? ' The previous folder was archived.' : ''}`);
  return opened;
}

module.exports = { archiveFilename, downloadLiveStory, downloadStoryRoot, fetchLivePackage, storyIdFromInput };

import type { NormalizedStory } from '../../model/normalized';
import type { StoryHandle } from '../../renderer/mount';

interface Revision { id: string; parentId?: string; digest: string; createdAt: string; operations?: { type?: string; diff?: { path?: string; before?: unknown; after?: unknown } | { path?: string; before?: unknown; after?: unknown }[] } }
interface Workspace { id: string; storyId: string; currentRevisionId: string; previewAcknowledgedRevisionId?: string; hasPendingChanges: boolean; status: string }
interface DraftAsset { id: string; logicalPath: string; mediaType: string; bytes: number; width: number; height: number; digest: string }
interface Conversation { id: string }
interface ConversationMessage { id: string; sequence: number; role: 'user' | 'assistant'; parts: { type: 'text'; text: string }[]; generationId?: string }
interface Generation {
  id: string; status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'; errorCode?: string; resultingRevisionId?: string;
  output?: { text?: string; workingDraftUpdated?: boolean; publishRequest?: { revisionId: string; summary: string; approvalRequired: true; reviewUrl: string } };
}
interface StoryMemory { id: string; category: string; value: unknown; confidence: number; status: string; provenance: { evidence?: string; reason?: string } }
export interface EditorHandle { destroy(): void }
export interface EditorContext { panelId?: string; assetIds: string[] }
type EditorCommand = 'help' | 'list-assets' | 'clear' | 'accept' | 'discard' | 'publish';

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = row[0]; row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const above = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return row[right.length];
}

export function resolveEditorCommand(input: string): EditorCommand | undefined {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalized === 'help') return 'help';
  if (normalized === 'list assets' || normalized === 'assets') return 'list-assets';
  if (normalized === 'clear') return 'clear';
  if (normalized === 'accept' || normalized === 'accept changes' || normalized === 'accpet'
    || (normalized.length >= 5 && normalized.length <= 7 && editDistance(normalized, 'accept') <= 1)) return 'accept';
  if (normalized === 'discard' || normalized === 'discard changes') return 'discard';
  if (normalized === 'publish' || normalized === 'publish story' || normalized === 'publish this story'
    || (normalized.length >= 6 && normalized.length <= 8 && editDistance(normalized, 'publish') <= 1)) return 'publish';
  return undefined;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined;
    throw new Error(body?.error?.message ?? 'The authoring request failed.');
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

function button(label: string, action: () => void | Promise<void>): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button'; element.textContent = label;
  element.addEventListener('click', () => void action());
  return element;
}

export async function attachEditor(
  shell: HTMLElement,
  story: NormalizedStory,
  handle: StoryHandle,
  workspaceId: string,
  revisionId: string,
  refreshPreview?: (context: EditorContext) => Promise<void>,
  initialContext?: EditorContext,
): Promise<EditorHandle> {
  const panelContextKey = `scrolltastic:editor-panel:${workspaceId}`;
  const assetContextKey = `scrolltastic:editor-assets:${workspaceId}`;
  const [{ workspace }, { revisions }, initialAssets, capabilities] = await Promise.all([
    json<{ workspace: Workspace }>(`/api/workspaces/${workspaceId}`),
    json<{ revisions: Revision[] }>(`/api/workspaces/${workspaceId}/revisions`),
    json<{ assets: DraftAsset[] }>(`/api/workspaces/${workspaceId}/assets`),
    json<{ actions: string[] }>(`/api/stories/${story.id}/capabilities`),
  ]);
  if (workspace.storyId !== story.id || workspace.currentRevisionId !== revisionId) throw new Error('This preview is not the current workspace revision.');
  shell.replaceChildren(); shell.hidden = false;
  const header = document.createElement('header');
  const heading = document.createElement('h2'); heading.textContent = 'Story editor';
  const status = document.createElement('p'); status.className = 'editor-status'; status.setAttribute('role', 'status');
  const marker = document.createElement('div'); marker.className = 'editor-selection-marker'; marker.hidden = true; marker.setAttribute('aria-hidden', 'true');
  document.body.append(marker);
  let viewingStory = false;
  const reopen = button('Edit story', () => setViewingStory(false));
  reopen.className = 'editor-reopen'; reopen.hidden = true;
  document.body.append(reopen);
  const setViewingStory = (viewing: boolean) => {
    viewingStory = viewing;
    shell.hidden = viewing;
    reopen.hidden = !viewing;
    if (viewing) marker.hidden = true;
    else placeMarker();
  };
  const view = button('View story', () => setViewingStory(true));
  const close = document.createElement('a'); close.href = `/s/${story.id}`; close.textContent = 'Production';
  const headerActions = document.createElement('div'); headerActions.className = 'editor-header-actions'; headerActions.append(view, close);
  header.append(heading, headerActions);

  let selected: HTMLElement | undefined;
  let selectedId = initialContext?.panelId ?? (sessionStorage.getItem(panelContextKey) || undefined);
  let storedAssetIds: unknown = [];
  try { storedAssetIds = JSON.parse(sessionStorage.getItem(assetContextKey) ?? '[]'); } catch { storedAssetIds = []; }
  const availableAssetIds = new Set(initialAssets.assets.map(asset => asset.id));
  const contextAssetIds = initialContext?.assetIds ?? storedAssetIds;
  const selectedAssetIds = new Set(Array.isArray(contextAssetIds)
    ? contextAssetIds.filter((id): id is string => typeof id === 'string' && availableAssetIds.has(id)) : []);
  let destroyed = false;
  const placeMarker = () => {
    if (!selected?.isConnected) { marker.hidden = true; return; }
    const bounds = selected.getBoundingClientRect(); marker.hidden = false;
    Object.assign(marker.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
  };
  let contextText: HTMLElement | undefined;
  const updateContextText = () => {
    if (!contextText) return;
    const panelContext = selectedId ? `Panel ${selectedId}` : 'whole story';
    const assetContext = selectedAssetIds.size ? ` · ${selectedAssetIds.size} asset${selectedAssetIds.size === 1 ? '' : 's'}` : '';
    contextText.textContent = `Context: ${panelContext}${assetContext}`;
  };
  const select = (id?: string, reveal = false) => {
    selectedId = id; selected = id ? handle.elements.get(id) : undefined; placeMarker();
    if (id) sessionStorage.setItem(panelContextKey, id); else sessionStorage.removeItem(panelContextKey);
    updateContextText();
    if (reveal) selected?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  };
  const panelListeners: { panel: HTMLElement; listener: () => void }[] = [];
  for (const container of story.body.containers) for (const item of container.flow) {
    if (item.type !== 'panel') continue;
    const panel = handle.elements.get(item.id);
    if (panel) {
      const listener = () => { if (!viewingStory) select(item.id); };
      panel.addEventListener('click', listener); panelListeners.push({ panel, listener });
    }
  }
  if (selectedId && handle.elements.has(selectedId)) select(selectedId);
  else if (selectedId) select();

  const history = document.createElement('section');
  const historyHeading = document.createElement('h3'); historyHeading.textContent = 'Revisions'; history.append(historyHeading);
  const historyList = document.createElement('ol');
  for (const revision of revisions) {
    const item = document.createElement('li');
    const label = document.createElement('span'); label.textContent = `${revision.id === revisionId ? 'Current · ' : ''}${revision.operations?.type ?? 'base'} · ${revision.digest.slice(0, 8)}`;
    item.append(label);
    if (revision.operations?.diff) {
      const diff = document.createElement('code');
      const entries = Array.isArray(revision.operations.diff) ? revision.operations.diff : [revision.operations.diff];
      diff.textContent = entries.map(entry => `${entry.path}: ${String(entry.before)} → ${String(entry.after)}`).join('\n'); item.append(diff);
    }
    if (revision.id !== revisionId) item.append(button('Restore', async () => {
      const result = await json<{ revisionId: string }>(`/api/workspaces/${workspaceId}/revisions/${revision.id}/restore`, { method: 'POST' });
      location.assign(`/s/${story.id}/edit/${workspaceId}/r/${result.revisionId}`);
    }));
    historyList.append(item);
  }
  history.append(historyList);

  const assets = document.createElement('section'); assets.className = 'editor-assets';
  const assetsHeading = document.createElement('h3'); assetsHeading.textContent = 'Draft assets'; assets.append(assetsHeading);
  const assetList = document.createElement('ul');
  let availableAssets = [...initialAssets.assets];
  const renderAssets = (items: DraftAsset[]) => {
    availableAssets = [...items];
    assetList.replaceChildren();
    for (const asset of items) {
      const item = document.createElement('li');
      const image = document.createElement('img'); image.src = `/api/workspaces/${workspaceId}/assets/${asset.id}/content`;
      image.alt = ''; image.width = 48; image.height = Math.max(1, Math.round(48 * asset.height / asset.width));
      const detail = document.createElement('span'); detail.textContent = `${asset.logicalPath} · ${asset.width}×${asset.height}`;
      item.append(image, detail); assetList.append(item);
    }
  };
  renderAssets(initialAssets.assets);
  const uploadInput = document.createElement('input'); uploadInput.type = 'file';
  uploadInput.accept = 'image/png,image/jpeg,image/webp,image/avif,image/svg+xml'; uploadInput.hidden = true;
  uploadInput.setAttribute('aria-label', 'Upload image');
  let showEditorFeedback = (message: string) => { status.textContent = message; };
  const uploadAsset = async (file: File) => {
    uploadInput.disabled = true; showEditorFeedback(`Inspecting ${file.name}…`);
    try {
      const previousIds = new Set(availableAssets.map(asset => asset.id));
      const prepared = await json<{ grantId: string; pathname: string; clientToken: string }>(`/api/workspaces/${workspaceId}/uploads/prepare`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mediaType: file.type, area: 'assets' }),
      });
      const { put } = await import('@vercel/blob/client');
      await put(prepared.pathname, file, { access: 'private', token: prepared.clientToken, contentType: file.type });
      await json(`/api/workspaces/${workspaceId}/uploads/complete`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grantId: prepared.grantId }),
      });
      const refreshed = (await json<{ assets: DraftAsset[] }>(`/api/workspaces/${workspaceId}/assets`)).assets;
      renderAssets(refreshed);
      for (const asset of refreshed) if (!previousIds.has(asset.id)) selectedAssetIds.add(asset.id);
      sessionStorage.setItem(assetContextKey, JSON.stringify([...selectedAssetIds]));
      updateContextText();
      showEditorFeedback('The image passed inspection and is selected as context for your next request.');
    } catch (error) { showEditorFeedback(error instanceof Error ? error.message : 'Upload failed.'); }
    finally { uploadInput.value = ''; uploadInput.disabled = false; }
  };
  uploadInput.addEventListener('change', () => { const file = uploadInput.files?.[0]; if (file) void uploadAsset(file); });
  assets.append(assetList, uploadInput);

  const assistant = document.createElement('section'); assistant.className = 'editor-assistant';
  const canPublish = capabilities.actions.includes('story:publish');
  const assistantHeading = document.createElement('h3'); assistantHeading.textContent = 'Authoring assistant'; assistant.append(assistantHeading);
  const assistantNote = document.createElement('p'); assistantNote.className = 'editor-assistant-hint'; assistantNote.textContent = 'Type “help” to see commands.'; assistant.append(assistantNote);
  const context = document.createElement('div'); context.className = 'editor-assistant-context';
  contextText = document.createElement('span'); contextText.textContent = 'Context: whole story';
  updateContextText();
  context.append(contextText, button('Clear', () => select())); assistant.append(context);
  const proposalLink = document.createElement('a'); proposalLink.hidden = true; proposalLink.textContent = 'Refresh preview to see working changes'; assistant.append(proposalLink);
  const publishRequestLink = document.createElement('a'); publishRequestLink.hidden = true; publishRequestLink.textContent = 'Review and approve publish request'; assistant.append(publishRequestLink);
  const conversationLog = document.createElement('ol'); conversationLog.setAttribute('aria-label', 'Assistant conversation'); assistant.append(conversationLog);
  const promptForm = document.createElement('form');
  const promptLabel = document.createElement('label'); promptLabel.className = 'editor-composer-input';
  const promptLabelText = document.createElement('span'); promptLabelText.className = 'visually-hidden'; promptLabelText.textContent = 'Message the story assistant';
  const promptInput = document.createElement('textarea'); promptInput.rows = 1; promptInput.maxLength = 12000; promptInput.required = true; promptInput.placeholder = 'Message or type “help”'; promptLabel.append(promptLabelText, promptInput);
  const uploadButton = button('+', () => uploadInput.click()); uploadButton.className = 'editor-upload-button'; uploadButton.setAttribute('aria-label', 'Upload image'); uploadButton.title = 'Upload image';
  const send = button('Send', () => undefined); send.type = 'submit';
  const cancel = button('Cancel', () => undefined); cancel.hidden = true;
  const composer = document.createElement('div'); composer.className = 'editor-composer'; composer.append(uploadButton, promptLabel, send, cancel);
  promptForm.append(composer); assistant.append(promptForm);
  let advancedControls: HTMLDetailsElement | undefined;
  let publishActions: HTMLElement | undefined;
  let conversationId: string | undefined; let activeGenerationId: string | undefined;
  const renderMessages = (messages: ConversationMessage[]) => {
    conversationLog.replaceChildren();
    for (const message of messages) {
      const item = document.createElement('li');
      const role = document.createElement('strong'); role.textContent = message.role === 'user' ? 'You: ' : 'Assistant: ';
      const content = document.createElement('span'); content.textContent = message.parts.map(part => part.text).join('\n');
      item.append(role, content); conversationLog.append(item);
    }
    requestAnimationFrame(() => { conversationLog.scrollTop = conversationLog.scrollHeight; });
  };
  const showLocalMessage = (text: string) => {
    const item = document.createElement('li'); item.className = 'editor-command-message';
    const role = document.createElement('strong'); role.textContent = 'Editor: ';
    const content = document.createElement('span'); content.textContent = text;
    item.append(role, content); conversationLog.append(item);
    requestAnimationFrame(() => { conversationLog.scrollTop = conversationLog.scrollHeight; });
  };
  showEditorFeedback = showLocalMessage;
  const showAssetPicker = () => {
    if (!availableAssets.length) { showLocalMessage('No draft assets are available yet. Use + to upload an image.'); return; }
    const item = document.createElement('li'); item.className = 'editor-command-message editor-asset-picker';
    const role = document.createElement('strong'); role.textContent = 'Editor: Select assets for context'; item.append(role);
    const choices = document.createElement('div'); choices.className = 'editor-asset-choices';
    for (const asset of availableAssets) {
      const choice = document.createElement('label');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selectedAssetIds.has(asset.id);
      checkbox.setAttribute('aria-label', `Select ${asset.logicalPath}`);
      const image = document.createElement('img'); image.src = `/api/workspaces/${workspaceId}/assets/${asset.id}/content`; image.alt = '';
      const detail = document.createElement('span'); detail.textContent = `${asset.logicalPath}\n${asset.width}×${asset.height}`;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedAssetIds.add(asset.id); else selectedAssetIds.delete(asset.id);
        sessionStorage.setItem(assetContextKey, JSON.stringify([...selectedAssetIds]));
        updateContextText();
      });
      choice.append(checkbox, image, detail); choices.append(choice);
    }
    item.append(choices); conversationLog.append(item);
    requestAnimationFrame(() => { conversationLog.scrollTop = conversationLog.scrollHeight; });
  };
  const refreshMessages = async () => {
    if (!conversationId || destroyed) return [];
    const result = await json<{ messages: ConversationMessage[] }>(`/api/conversations/${conversationId}/messages`);
    renderMessages(result.messages); return result.messages;
  };
  const pollGeneration = async (generationId: string) => {
    activeGenerationId = generationId; send.disabled = true; cancel.hidden = false;
    while (!destroyed && activeGenerationId === generationId) {
      const { generation } = await json<{ generation: Generation }>(`/api/generations/${generationId}`);
      status.textContent = generation.status === 'pending' ? 'Assistant request queued…' : generation.status === 'running' ? 'Assistant is inspecting the draft…' : '';
      if (generation.status === 'completed') {
        await refreshMessages();
        if (generation.output?.publishRequest) {
          publishRequestLink.href = generation.output.publishRequest.reviewUrl;
          publishRequestLink.title = generation.output.publishRequest.summary;
          publishRequestLink.hidden = false;
        }
        if (generation.output?.workingDraftUpdated) {
          showLocalMessage('Updating the story preview…');
          if (refreshPreview) await refreshPreview({ panelId: selectedId, assetIds: [...selectedAssetIds] });
          else location.reload();
          return;
        } else status.textContent = generation.output?.publishRequest ? 'Publication requires your review and explicit approval.' : 'Assistant response saved.';
        break;
      }
      if (generation.status === 'failed' || generation.status === 'cancelled') { status.textContent = generation.status === 'cancelled' ? 'Assistant request cancelled.' : `Assistant failed: ${generation.errorCode ?? 'provider error'}.`; break; }
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    if (activeGenerationId === generationId) activeGenerationId = undefined;
    send.disabled = false; cancel.hidden = true;
  };
  const startAssistant = async () => {
    send.disabled = true; promptInput.disabled = true;
    try {
      const result = await json<{ conversation: Conversation }>(`/api/workspaces/${workspaceId}/conversations`, { method: 'POST' });
      conversationId = result.conversation.id;
      const messages = await refreshMessages();
      const last = messages.at(-1);
      if (last?.role === 'user' && last.generationId) {
        const { generation } = await json<{ generation: Generation }>(`/api/generations/${last.generationId}`);
        if (generation.status === 'pending' || generation.status === 'running') void pollGeneration(last.generationId);
      }
      promptInput.disabled = false; send.disabled = false; promptInput.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Assistant could not start.';
      status.textContent = message; showLocalMessage(message);
    }
  };
  promptForm.addEventListener('submit', event => void (async () => {
    event.preventDefault(); if (!promptInput.value.trim()) return;
    const entered = promptInput.value.trim();
    const command = resolveEditorCommand(entered);
    if (command === 'help') {
      promptInput.value = '';
      showLocalMessage('Commands\nhelp — show this list\nlist assets — select asset context\naccept — accept the assistant’s pending changes\ndiscard — discard the assistant’s pending changes\npublish — prepare the accepted revision for review\nclear — clear Panel and asset context\n\nYou can also describe any story change in ordinary language.');
      return;
    }
    if (command === 'list-assets') {
      promptInput.value = ''; showAssetPicker(); return;
    }
    if (command === 'clear') {
      promptInput.value = ''; selectedAssetIds.clear(); sessionStorage.removeItem(assetContextKey); select(); showLocalMessage('Panel and asset context cleared.'); return;
    }
    const currentContext = () => ({ panelId: selectedId, assetIds: [...selectedAssetIds] });
    if (command === 'accept' || command === 'discard') {
      promptInput.value = '';
      if (!workspace.hasPendingChanges) { showLocalMessage('There are no pending assistant changes.'); return; }
      send.disabled = true;
      try {
        if (command === 'accept') {
          const result = await json<{ revisionId: string }>(`/api/workspaces/${workspaceId}/accept`, { method: 'POST' });
          window.history.replaceState(null, '', `/s/${story.id}/edit/${workspaceId}/r/${result.revisionId}`);
          showLocalMessage('Changes accepted. Updating the story preview…');
        } else {
          await json(`/api/workspaces/${workspaceId}/discard`, { method: 'POST' });
          showLocalMessage('Changes discarded. Updating the story preview…');
        }
        if (refreshPreview) await refreshPreview(currentContext()); else location.reload();
      } catch (error) {
        send.disabled = false;
        showLocalMessage(error instanceof Error ? error.message : `Could not ${command} the pending changes.`);
      }
      return;
    }
    if (command === 'publish' && workspace.hasPendingChanges) {
      promptInput.value = ''; showLocalMessage('Accept or discard the pending assistant changes before publishing. Type “accept” to keep them or “discard” to remove them.'); return;
    }
    if (command === 'publish' && !canPublish) {
      promptInput.value = ''; showLocalMessage('Your account cannot publish this story.'); return;
    }
    if (command === 'publish') {
      promptInput.value = '';
      if (advancedControls) advancedControls.open = true;
      showLocalMessage(workspace.previewAcknowledgedRevisionId === revisionId
        ? 'This revision has been reviewed. Select “Approve and publish” below to publish it.'
        : 'Review this exact preview, then select “Mark preview reviewed” and “Approve and publish” below.');
      requestAnimationFrame(() => publishActions?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
      return;
    }
    if (!conversationId) { showLocalMessage('The assistant conversation is unavailable. Refresh the editor and try again.'); return; }
    send.disabled = true;
    try {
      const result = await json<{ generation: Generation }>(`/api/conversations/${conversationId}/generations`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ prompt: command === 'publish' ? 'Prepare the current revision for publication.' : entered,
          ...(selectedId ? { selectedId } : {}), ...(selectedAssetIds.size ? { selectedAssetIds: [...selectedAssetIds] } : {}),
          mode: command === 'publish' ? 'publisher' : 'assist' }),
      });
      promptInput.value = ''; await refreshMessages(); await pollGeneration(result.generation.id);
    } catch (error) {
      send.disabled = false;
      const message = error instanceof Error ? error.message : 'Assistant request failed.';
      status.textContent = message; showLocalMessage(message);
    }
  })());
  cancel.addEventListener('click', () => void (async () => {
    if (!activeGenerationId) return;
    cancel.disabled = true;
    try { await json(`/api/generations/${activeGenerationId}/cancel`, { method: 'POST' }); }
    catch (error) { status.textContent = error instanceof Error ? error.message : 'Cancellation failed.'; }
    finally { cancel.disabled = false; }
  })());

  const memory = document.createElement('section'); memory.className = 'editor-memory';
  const memoryHeading = document.createElement('h3'); memoryHeading.textContent = 'Story memory'; memory.append(memoryHeading);
  const memoryNote = document.createElement('p'); memoryNote.textContent = 'Approved memory may guide the assistant. Proposals are reviewed independently from story revisions.'; memory.append(memoryNote);
  const memoryList = document.createElement('ul'); memory.append(memoryList);
  const loadMemory = async () => {
    const result = await json<{ memory: StoryMemory[] }>(`/api/stories/${story.id}/memory?status=proposed`);
    memoryList.replaceChildren();
    if (!result.memory.length) { const empty = document.createElement('li'); empty.textContent = 'No memory proposals awaiting review.'; memoryList.append(empty); }
    for (const entry of result.memory) {
      const item = document.createElement('li');
      const summary = document.createElement('code'); summary.textContent = `${entry.category} · ${Math.round(entry.confidence * 100)}%\n${JSON.stringify(entry.value)}`;
      const review = async (decision: 'approved' | 'rejected') => {
        await json(`/api/stories/${story.id}/memory/${entry.id}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision }) });
        status.textContent = `Memory proposal ${decision}.`; await loadMemory();
      };
      item.append(summary, button('Approve', () => review('approved')), button('Reject', () => review('rejected'))); memoryList.append(item);
    }
  };
  const loadMemoryButton = button('Review proposals', async () => {
    loadMemoryButton.disabled = true;
    try { await loadMemory(); }
    catch (error) { status.textContent = error instanceof Error ? error.message : 'Memory review is unavailable.'; }
    finally { loadMemoryButton.disabled = false; }
  });
  const operationsButton = button('View operations', async () => {
    operationsButton.disabled = true;
    try {
      const result = await json<{ operations: { usage: { tokens: number; cost: number }; openMaintenanceFailures: number; generations: { status: string; count: number }[] } }>(`/api/stories/${story.id}/operations`);
      status.textContent = `AI usage: ${result.operations.usage.tokens} tokens / $${result.operations.usage.cost.toFixed(4)} · open maintenance failures: ${result.operations.openMaintenanceFailures}.`;
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Operations are unavailable.'; }
    finally { operationsButton.disabled = false; }
  });
  memory.append(loadMemoryButton, operationsButton);

  const actions = document.createElement('footer'); publishActions = actions;
  if (workspace.hasPendingChanges) {
    actions.append(
      button('Accept changes', async () => {
        const result = await json<{ revisionId: string }>(`/api/workspaces/${workspaceId}/accept`, { method: 'POST' });
        window.history.replaceState(null, '', `/s/${story.id}/edit/${workspaceId}/r/${result.revisionId}`);
        if (refreshPreview) await refreshPreview({ panelId: selectedId, assetIds: [...selectedAssetIds] }); else location.reload();
      }),
      button('Discard changes', async () => {
        await json(`/api/workspaces/${workspaceId}/discard`, { method: 'POST' });
        if (refreshPreview) await refreshPreview({ panelId: selectedId, assetIds: [...selectedAssetIds] }); else location.reload();
      }),
    );
  }
  const acknowledged = workspace.previewAcknowledgedRevisionId === revisionId;
  const acknowledge = button(acknowledged ? 'Preview reviewed' : 'Mark preview reviewed', async () => {
    acknowledge.disabled = true;
    try { await json(`/api/workspaces/${workspaceId}/revisions/${revisionId}/preview-ack`, { method: 'POST' }); commit.disabled = false; acknowledge.textContent = 'Preview reviewed'; status.textContent = 'This exact revision is acknowledged.'; }
    catch (error) { acknowledge.disabled = false; status.textContent = error instanceof Error ? error.message : 'Acknowledgement failed.'; }
  });
  acknowledge.disabled = acknowledged || workspace.hasPendingChanges;
  const commit = button('Approve and publish', async () => {
    commit.disabled = true;
    try { const result = await json<{ readerUrl: string }>(`/api/workspaces/${workspaceId}/commit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revisionId }) }); location.assign(result.readerUrl); }
    catch (error) { commit.disabled = false; status.textContent = error instanceof Error ? error.message : 'Commit failed.'; }
  });
  commit.disabled = !acknowledged;
  commit.hidden = !canPublish;
  const shareOutput = document.createElement('div'); shareOutput.className = 'editor-share-output'; shareOutput.hidden = true;
  const createShare = button('Create 30-minute share link', async () => {
    createShare.disabled = true; shareOutput.hidden = true; shareOutput.replaceChildren();
    try {
      const result = await json<{ share: { id: string; url: string; expiresAt: string } }>(
        `/api/workspaces/${workspaceId}/revisions/${revisionId}/shares`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      );
      const label = document.createElement('label'); label.textContent = `Expires ${new Date(result.share.expiresAt).toLocaleString()}`;
      const value = document.createElement('input'); value.type = 'text'; value.readOnly = true; value.value = result.share.url;
      value.setAttribute('aria-label', 'Short-lived story share link');
      const copy = button('Copy link', async () => {
        try { await navigator.clipboard.writeText(value.value); status.textContent = 'Share link copied.'; }
        catch { value.select(); status.textContent = 'Copy is unavailable. Select and copy the link manually.'; }
      });
      const revoke = button('Revoke link', async () => {
        revoke.disabled = true;
        try {
          await json(`/api/shares/${result.share.id}`, { method: 'DELETE' });
          shareOutput.replaceChildren(); shareOutput.hidden = true; status.textContent = 'Share link revoked.';
        } catch (error) { revoke.disabled = false; status.textContent = error instanceof Error ? error.message : 'Revocation failed.'; }
      });
      shareOutput.append(label, value, copy, revoke); shareOutput.hidden = false;
      status.textContent = 'A short-lived link was created. Anyone with the link can read this revision until it expires or is revoked.';
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Share creation failed.'; }
    finally { createShare.disabled = workspace.hasPendingChanges; }
  });
  createShare.disabled = workspace.hasPendingChanges;
  createShare.hidden = !canPublish;
  actions.append(acknowledge, commit, createShare, shareOutput);
  const advanced = document.createElement('details'); advancedControls = advanced; advanced.className = 'editor-advanced';
  const advancedSummary = document.createElement('summary'); advancedSummary.textContent = 'Advanced';
  advanced.append(advancedSummary, assets, memory, history, actions);
  assistant.insertBefore(advanced, proposalLink);
  shell.append(header, status, assistant);
  void startAssistant();
  const update = () => placeMarker();
  addEventListener('scroll', update, { passive: true }); addEventListener('resize', update);
  return { destroy() {
    destroyed = true;
    removeEventListener('scroll', update); removeEventListener('resize', update);
    for (const { panel, listener } of panelListeners) panel.removeEventListener('click', listener);
    marker.remove(); reopen.remove(); shell.hidden = true; shell.replaceChildren();
  } };
}

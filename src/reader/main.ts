import { mountStory, type StoryHandle } from '../renderer/mount';
import { StoryValidationError } from '../parser/parse';
import { loadStoryRoot, resolveStory, resolveStoryPackage, storyIdPattern } from './resolve-story';
import { renderLanding } from './landing';
import type { ControlsHandle } from '../inputs/controls';
import type { EditorContext } from '../authoring/client/editor';
import './reader.css';

const root = document.querySelector<HTMLElement>('#app')!;
const authoring = document.querySelector<HTMLElement>('#authoring-controls')!;
let current: StoryHandle | undefined;
let animations: { destroy(): void } | undefined;
let controls: ControlsHandle | undefined;
let request: AbortController | undefined;
let editor: { destroy(): void } | undefined;
let revision = 0;

function message(title: string, description: string) {
  const box = document.createElement('div');
  box.className = 'reader-message';
  const brand = document.createElement('p');
  brand.className = 'reader-brand';
  brand.textContent = 'SCROLLTASTIC';
  const heading = document.createElement('h1');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = description;
  box.append(brand, heading, text);
  root.replaceChildren(box);
}

async function readRoute(editorContext?: EditorContext) {
  const run = ++revision;
  request?.abort();
  editor?.destroy(); editor = undefined;
  controls?.destroy();
  controls = undefined;
  animations?.destroy();
  animations = undefined;
  current?.destroy();
  current = undefined;
  request = new AbortController();
  document.title = 'Scrolltastic';
  root.removeAttribute('aria-busy');
  delete root.dataset.ready;
  authoring.hidden = true;
  authoring.replaceChildren();
  const path = location.pathname;
  root.classList.toggle('landing-host', path === '/');
  if (path === '/') {
    renderLanding(root);
    return;
  }
  const match = /^\/s\/([^/]+)\/?$/.exec(path);
  const preview = /^\/s\/([^/]+)\/edit\/([0-9a-f-]+)\/r\/([0-9a-f-]+)\/?$/.exec(path);
  if ((!match && !preview) || !storyIdPattern.test((match ?? preview)![1])) {
    message('Story not found', 'Check the story link and try again.');
    return;
  }
  const id = (match ?? preview)![1];
  message('Opening your story…', 'One moment.');
  root.setAttribute('aria-busy', 'true');
  try {
    const resolved = preview
      ? await resolveStoryPackage(id, `/api/workspaces/${preview[2]}/revisions/${preview[3]}/package/`, location.origin, request.signal)
      : await resolveStory(id, await loadStoryRoot(request.signal), location.origin, request.signal);
    const { document, assetBaseUrl, diagnostics } = resolved;
    if (run !== revision) return;
    if (import.meta.env.DEV && diagnostics.length) console.warn('Scrolltastic story diagnostics', diagnostics);
    current = mountStory(root, document, { assetBaseUrl, viewportBottomInset: () => controls?.height ?? 0 });
    await current.ready;
    if (run !== revision) return;
    if (current.animations.length) {
      const { attachStoryAnimations } = await import('../animation/reveals');
      if (run !== revision) return;
      animations = attachStoryAnimations(current.elements.get(document.id)!, current.animations);
    }
    if (document.body.interaction?.advance.enabled) {
      const { attachBeatControls } = await import('../inputs/controls');
      if (run !== revision) return;
      controls = attachBeatControls(root, current, document.body.interaction.advance.inputs?.includes('keyboard'), document.body.interaction.advance.inputs?.includes('flip'), document.body.interaction.scroll?.snap === 'beats', document.body.interaction.advance.inputs?.includes('tap'));
      current.refreshBeats();
    }
    window.document.title = `${document.title} · Scrolltastic`;
    root.dataset.ready = 'true';
    if (preview) {
      const { attachEditor } = await import('../authoring/client/editor');
      if (run !== revision) return;
      editor = await attachEditor(
        window.document.querySelector<HTMLElement>('#editor-shell')!, document, current, preview[2], preview[3],
        async context => readRoute(context),
        editorContext,
      );
    }
    if (!preview && document.authoring?.ai.enabled) {
      void fetch(`/api/stories/${id}/capabilities`, { credentials: 'same-origin', cache: 'no-store' })
        .then(async response => response.ok ? response.json() as Promise<{ authenticated?: boolean; authoring?: { canEdit?: boolean } }> : undefined)
        .then(async capabilities => {
          if (!capabilities || run !== revision) return;
          const setStatus = (message: string) => {
            let status = authoring.querySelector<HTMLElement>('[role="status"]');
            if (!status) { status = window.document.createElement('span'); status.setAttribute('role', 'status'); authoring.append(status); }
            status.textContent = message;
          };
          if (!capabilities.authenticated) {
            const signIn = window.document.createElement('button');
            signIn.type = 'button'; signIn.textContent = 'Sign in with Nostr';
            signIn.addEventListener('click', async () => {
              signIn.disabled = true; setStatus('Waiting for your Nostr signer…');
              try { const { signInWithNostr } = await import('../auth/nostr-client'); await signInWithNostr(location.pathname); }
              catch (error) { signIn.disabled = false; setStatus(error instanceof Error ? error.message : 'Nostr authentication failed.'); }
            });
            authoring.append(signIn); authoring.hidden = false; return;
          }
          const signOut = window.document.createElement('button');
          signOut.type = 'button'; signOut.textContent = 'Sign out';
          signOut.addEventListener('click', async () => {
            signOut.disabled = true;
            try { const { signOut } = await import('../auth/nostr-client'); await signOut(); }
            catch (error) { signOut.disabled = false; setStatus(error instanceof Error ? error.message : 'Sign out failed.'); }
          });
          if (!capabilities.authoring?.canEdit) {
            authoring.append(signOut); authoring.hidden = false; return;
          }
          const button = window.document.createElement('button');
          button.type = 'button';
          button.textContent = 'Edit';
          button.addEventListener('click', async () => {
            button.disabled = true;
            try {
              const response = await fetch(`/api/stories/${id}/workspaces`, { method: 'POST', credentials: 'same-origin' });
              if (!response.ok) throw new Error('The editing workspace could not be opened.');
              const result = await response.json() as { workspace: { id: string; currentRevisionId: string } };
              location.assign(`/s/${id}/edit/${result.workspace.id}/r/${result.workspace.currentRevisionId}`);
            } catch (error) {
              button.disabled = false;
              button.setAttribute('aria-label', error instanceof Error ? error.message : 'The editing workspace could not be opened.');
            }
          });
          authoring.append(button, signOut);
          authoring.hidden = false;
        }).catch(() => {});
    }
  } catch (error) {
    if (run !== revision || (error instanceof DOMException && error.name === 'AbortError')) return;
    controls?.destroy();
    controls = undefined;
    animations?.destroy();
    animations = undefined;
    current?.destroy();
    current = undefined;
    message('Story unavailable', error instanceof StoryValidationError
      ? 'This story has an invalid or unsupported configuration.'
      : error instanceof Error ? error.message : 'Please try opening the story again.');
    if (import.meta.env.DEV && error instanceof StoryValidationError) {
      const detail = document.createElement('pre');
      detail.className = 'reader-diagnostics';
      detail.textContent = error.message;
      root.append(detail);
    }
  } finally {
    if (run === revision) root.removeAttribute('aria-busy');
  }
}
const handlePopState = () => void readRoute();
window.addEventListener('popstate', handlePopState);
void readRoute();
if (import.meta.hot) import.meta.hot.dispose(() => {
  revision++;
  request?.abort();
  controls?.destroy();
  controls = undefined;
  animations?.destroy();
  current?.destroy();
  editor?.destroy();
  window.removeEventListener('popstate', handlePopState);
});

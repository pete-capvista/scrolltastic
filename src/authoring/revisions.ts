import { createHash } from 'node:crypto';
import { validateStory, type ValidationDiagnostic } from '../parser/parse.js';
import type { NormalizedStory } from '../model/normalized.js';
import { applyAuthoringOperations, type AuthoringOperation } from './patch.js';

export interface DraftRevisionContent {
  document: NormalizedStory;
  bytes: Uint8Array;
  digest: string;
  diagnostics: readonly ValidationDiagnostic[];
}

export function canonicalStoryBytes(document: NormalizedStory): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(document, null, 2)}\n`);
}

export function validatedRevision(input: unknown): DraftRevisionContent {
  const result = validateStory(input);
  if (!result.document) throw new Error(result.diagnostics[0]?.message ?? 'The draft is invalid.');
  const bytes = canonicalStoryBytes(result.document);
  return {
    document: result.document,
    bytes,
    digest: createHash('sha256').update(bytes).digest('hex'),
    diagnostics: result.diagnostics,
  };
}

export interface CommitState {
  workspaceStatus: 'active' | 'committed' | 'closed' | 'conflict';
  currentRevisionId: string;
  acknowledgedRevisionId?: string;
  baseEtag: string;
  productionEtag: string;
  revisionValid: boolean;
  hasPendingChanges?: boolean;
}

export type CommitBlock = 'workspace_inactive' | 'stale_revision' | 'pending_changes' | 'preview_required' | 'invalid_revision' | 'revision_conflict';

export function commitBlock(state: CommitState, requestedRevisionId: string): CommitBlock | undefined {
  if (state.workspaceStatus !== 'active') return 'workspace_inactive';
  if (state.currentRevisionId !== requestedRevisionId) return 'stale_revision';
  if (state.hasPendingChanges) return 'pending_changes';
  if (state.acknowledgedRevisionId !== requestedRevisionId) return 'preview_required';
  if (!state.revisionValid) return 'invalid_revision';
  if (state.baseEtag !== state.productionEtag) return 'revision_conflict';
  return undefined;
}

export interface RecordedOperation { type: string; [key: string]: unknown }

export function replayRebaseOperations(base: unknown, operations: readonly (RecordedOperation | null)[]): DraftRevisionContent {
  let document = structuredClone(base) as Record<string, unknown>;
  for (const operation of operations) {
    if (!operation) continue;
    if (operation.type === 'test-title' && typeof operation.title === 'string') document = { ...document, title: operation.title };
    else if (operation.type === 'ai-patch' && Array.isArray(operation.operations)) {
      document = applyAuthoringOperations(document, operation.operations as AuthoringOperation[]).document as Record<string, unknown>;
    }
    else throw new Error(`Rebase cannot safely replay operation: ${operation.type}.`);
  }
  return validatedRevision(document);
}

import { authenticateRequest, AuthenticationError } from '../../src/auth/identity.js';
import type { Principal, StoryAction } from '../../src/auth/model.js';
import { canStory } from '../../src/auth/policy.js';
import { storyMembershipRepository, storyOrganizationId } from '../../src/persistence/postgres.js';
import { workspaceSummary, type WorkspaceSummary } from '../../src/authoring/workspace-repository.js';
import { RequestSecurityError, requireTrustedMutationOrigin } from '../../src/auth/request-security.js';
import { authoringRolloutDecision } from '../../src/auth/rollout.js';
import { logOperationalEvent } from '../../src/observability/events.js';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class AuthoringError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function parseJsonRequest(request: Request, maximumBytes = 64 * 1024): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new AuthoringError(415, 'unsupported_media_type', 'Expected a JSON request.');
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new AuthoringError(413, 'request_too_large', 'The request body is too large.');
  const text = await request.text();
  if (!text || new TextEncoder().encode(text).byteLength > maximumBytes) throw new AuthoringError(text ? 413 : 400, text ? 'request_too_large' : 'invalid_json', text ? 'The request body is too large.' : 'A JSON request body is required.');
  try { return JSON.parse(text); }
  catch { throw new AuthoringError(400, 'invalid_json', 'The request body is not valid JSON.'); }
}

export function authoringError(error: unknown): Response {
  const safe = error instanceof AuthoringError ? error : new AuthoringError(500, 'internal_error', 'The authoring request failed.');
  if (!(error instanceof AuthoringError)) logOperationalEvent({ event: 'authoring.request', outcome: 'failed', errorCode: 'internal_error' });
  return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status, headers: { 'cache-control': 'no-store' } });
}

export async function requireAccount(request: Request): Promise<Principal & { accountId: string }> {
  let principal;
  try { principal = await authenticateRequest(request); }
  catch (error) {
    if (error instanceof AuthenticationError) throw new AuthoringError(error.status, 'unauthenticated', error.message);
    throw error;
  }
  if (!principal?.accountId) throw new AuthoringError(401, 'unauthenticated', 'Sign in to use browser authoring.');
  return principal as Principal & { accountId: string };
}

export async function requireStoryAction(request: Request, storyId: string, action: StoryAction): Promise<Principal & { accountId: string }> {
  if (!UUID.test(storyId)) throw new AuthoringError(400, 'invalid_story', 'A valid story ID is required.');
  const principal = await requireAccount(request);
  if (!['GET', 'HEAD'].includes(request.method)) {
    try { requireTrustedMutationOrigin(request); }
    catch (error) {
      if (error instanceof RequestSecurityError) throw new AuthoringError(403, 'forbidden_origin', error.message);
      throw error;
    }
  }
  if (!await canStory(storyMembershipRepository(), storyId, principal, action)) {
    logOperationalEvent({ event: 'authorization.denied', outcome: 'failed', storyId, errorCode: 'forbidden' });
    throw new AuthoringError(403, 'forbidden', 'This account is not authorized for this story.');
  }
  const rollout = authoringRolloutDecision(action, { accountId: principal.accountId, storyId, organizationId: await storyOrganizationId(storyId) });
  if (!rollout.allowed) {
    logOperationalEvent({ event: 'rollout.denied', outcome: 'failed', storyId, errorCode: rollout.code });
    throw new AuthoringError(rollout.code === 'not_eligible' ? 403 : 503, rollout.code ?? 'authoring_disabled', rollout.code === 'not_eligible' ? 'This account is not eligible for browser authoring.' : 'This authoring capability is temporarily unavailable.');
  }
  return principal;
}

export async function requireWorkspaceAction(request: Request, workspaceId: string, action: StoryAction): Promise<{ principal: Principal & { accountId: string }; workspace: WorkspaceSummary }> {
  if (!UUID.test(workspaceId)) throw new AuthoringError(400, 'invalid_workspace', 'A valid workspace ID is required.');
  const workspace = await workspaceSummary(workspaceId);
  if (!workspace) throw new AuthoringError(404, 'not_found', 'Workspace not found.');
  const principal = await requireStoryAction(request, workspace.storyId, action);
  return { principal, workspace };
}

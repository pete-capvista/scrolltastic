import { AuthoringError, authoringError, parseJsonRequest, requireWorkspaceAction, UUID } from '../../../../authoring/_shared.js';
import { createRevisionShare, ShareGrantError } from '../../../../../src/sharing/service.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const parts = (url.searchParams.get('__route') ?? url.pathname).split('/').filter(Boolean);
    const workspaceId = parts.at(-4);
    const revisionId = parts.at(-2);
    if (!workspaceId || !revisionId || !UUID.test(workspaceId) || !UUID.test(revisionId)) {
      throw new AuthoringError(400, 'invalid_share', 'Valid workspace and revision IDs are required.');
    }
    const { principal } = await requireWorkspaceAction(request, workspaceId, 'story:publish');
    const body = await parseJsonRequest(request, 2 * 1024) as { lifetimeSeconds?: unknown };
    const lifetimeMs = body.lifetimeSeconds === undefined ? undefined
      : typeof body.lifetimeSeconds === 'number' ? body.lifetimeSeconds * 1000 : Number.NaN;
    const grant = await createRevisionShare(workspaceId, revisionId, principal, lifetimeMs);
    const origin = new URL(request.url).origin;
    return Response.json({
      share: { id: grant.id, storyId: grant.storyId, revisionId: grant.revisionId, expiresAt: grant.expiresAt,
        url: `${origin}/share#${grant.token}` },
    }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof ShareGrantError) {
      const status = error.code === 'not_found' ? 404 : error.code === 'persistence_unavailable' ? 503 : 400;
      return authoringError(new AuthoringError(status, error.code, error.message));
    }
    return authoringError(error);
  }
}

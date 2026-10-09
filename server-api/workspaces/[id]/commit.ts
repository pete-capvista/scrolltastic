import { promoteWorkspace, PromotionError } from '../../../src/authoring/promotion.js';
import { blobToken } from '../../publish/_shared.js';
import { authoringError, AuthoringError, parseJsonRequest, requireWorkspaceAction, UUID } from '../../authoring/_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const workspaceId = parts.at(-2) ?? '';
    const body = await parseJsonRequest(request, 4 * 1024);
    const revisionId = body && typeof body === 'object' ? (body as Record<string, unknown>).revisionId : undefined;
    if (typeof revisionId !== 'string' || !UUID.test(revisionId)) throw new AuthoringError(400, 'invalid_revision', 'A valid revision ID is required.');
    const { principal } = await requireWorkspaceAction(request, workspaceId, 'story:publish');
    return Response.json(await promoteWorkspace(workspaceId, revisionId, principal, blobToken()), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof PromotionError) return authoringError(new AuthoringError(error.code === 'not_found' ? 404 : error.code === 'revision_conflict' ? 409 : 400, error.code, error.message));
    return authoringError(error);
  }
}

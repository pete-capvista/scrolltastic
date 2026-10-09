import { acknowledgePreview } from '../../../../../src/authoring/workspace-repository.js';
import { authoringError, AuthoringError, requireWorkspaceAction, UUID } from '../../../../authoring/_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const revisionId = parts.at(-2) ?? '';
    const workspaceId = parts.at(-4) ?? '';
    if (!UUID.test(revisionId)) throw new AuthoringError(400, 'invalid_revision', 'A valid revision ID is required.');
    const { principal } = await requireWorkspaceAction(request, workspaceId, 'story:edit');
    await acknowledgePreview(workspaceId, revisionId, principal);
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  } catch (error) { return authoringError(error); }
}

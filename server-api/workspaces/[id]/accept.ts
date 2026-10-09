import { acceptWorkingDraft, PatchRevisionError } from '../../../src/authoring/patch-service.js';
import { authoringError, AuthoringError, requireWorkspaceAction } from '../../authoring/_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const workspaceId = new URL(request.url).pathname.split('/').filter(Boolean).at(-2) ?? '';
    const { principal } = await requireWorkspaceAction(request, workspaceId, 'story:edit');
    const revisionId = await acceptWorkingDraft(workspaceId, principal);
    return Response.json({ revisionId }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof PatchRevisionError) return authoringError(new AuthoringError(409, error.code, error.message));
    return authoringError(error);
  }
}

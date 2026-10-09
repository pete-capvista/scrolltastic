import { rebaseWorkspace } from '../../../src/authoring/workspace-repository.js';
import { blobToken } from '../../publish/_shared.js';
import { authoringError, requireWorkspaceAction } from '../../authoring/_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const workspaceId = parts.at(-2) ?? '';
    const { principal } = await requireWorkspaceAction(request, workspaceId, 'story:edit');
    return Response.json(await rebaseWorkspace(workspaceId, principal, blobToken()), { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) { return authoringError(error); }
}

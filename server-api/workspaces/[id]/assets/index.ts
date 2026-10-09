import { listDraftAssets } from '../../../../src/authoring/asset-service.js';
import { authoringError, requireWorkspaceAction } from '../../../authoring/_shared.js';

export async function GET(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const workspaceId = parts.at(-2) ?? '';
    await requireWorkspaceAction(request, workspaceId, 'story:read-draft');
    return Response.json({ assets: await listDraftAssets(workspaceId) }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) { return authoringError(error); }
}

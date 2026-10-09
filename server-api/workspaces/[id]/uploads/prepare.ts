import { prepareDraftUpload, DraftAssetError } from '../../../../src/authoring/asset-service.js';
import { authoringError, AuthoringError, parseJsonRequest, requireWorkspaceAction } from '../../../authoring/_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const workspaceId = parts.at(-3) ?? '';
    const { principal } = await requireWorkspaceAction(request, workspaceId, 'story:upload');
    const body = await parseJsonRequest(request, 4 * 1024);
    if (!body || typeof body !== 'object') throw new AuthoringError(400, 'invalid_asset', 'Upload details are required.');
    return Response.json(await prepareDraftUpload(workspaceId, principal, body as { mediaType: unknown; area?: unknown }), {
      status: 201, headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof DraftAssetError) return authoringError(new AuthoringError(error.code === 'asset_quota' ? 429 : 400, error.code, error.message));
    return authoringError(error);
  }
}

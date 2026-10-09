import { completeDraftUpload, DraftAssetError } from '../../../../src/authoring/asset-service.js';
import { authoringError, AuthoringError, parseJsonRequest, requireWorkspaceAction, UUID } from '../../../authoring/_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const workspaceId = parts.at(-3) ?? '';
    const { principal } = await requireWorkspaceAction(request, workspaceId, 'story:upload');
    const body = await parseJsonRequest(request, 4 * 1024);
    const grantId = body && typeof body === 'object' ? (body as Record<string, unknown>).grantId : undefined;
    if (typeof grantId !== 'string' || !UUID.test(grantId)) throw new AuthoringError(400, 'invalid_upload', 'A valid upload grant is required.');
    return Response.json({ asset: await completeDraftUpload(workspaceId, grantId, principal) }, {
      status: 201, headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof DraftAssetError) {
      const status = error.code === 'upload_expired' ? 410 : error.code === 'upload_incomplete' ? 409 : 400;
      return authoringError(new AuthoringError(status, error.code, error.message));
    }
    return authoringError(error);
  }
}

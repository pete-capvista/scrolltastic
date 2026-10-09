import { get } from '@vercel/blob';
import { draftAssetContent, draftBlobToken } from '../../../../../src/authoring/asset-service.js';
import { authoringError, AuthoringError, requireWorkspaceAction, UUID } from '../../../../authoring/_shared.js';

export async function GET(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const workspaceId = parts.at(-4) ?? '';
    const assetId = parts.at(-2) ?? '';
    if (!UUID.test(assetId)) throw new AuthoringError(400, 'invalid_asset', 'A valid asset ID is required.');
    await requireWorkspaceAction(request, workspaceId, 'story:read-draft');
    const asset = await draftAssetContent(workspaceId, assetId);
    if (!asset) throw new AuthoringError(404, 'not_found', 'Draft asset not found.');
    const object = await get(asset.storageKey, { access: 'private', token: draftBlobToken(), useCache: false });
    if (!object || object.statusCode !== 200) throw new AuthoringError(404, 'not_found', 'Draft asset content not found.');
    return new Response(object.stream, { headers: {
      'content-type': asset.mediaType, 'content-disposition': 'inline', 'cache-control': 'private, no-store',
      'etag': `"${asset.digest}"`, 'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    } });
  } catch (error) { return authoringError(error); }
}

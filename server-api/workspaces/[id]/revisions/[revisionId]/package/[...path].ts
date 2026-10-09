import { get } from '@vercel/blob';
import { revisionPackageEntry } from '../../../../../../src/authoring/workspace-repository.js';
import { draftBlobToken } from '../../../../../../src/authoring/asset-service.js';
import { blobToken } from '../../../../../publish/_shared.js';
import { authoringError, AuthoringError, requireWorkspaceAction, UUID } from '../../../../../authoring/_shared.js';

export async function GET(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const packageIndex = parts.indexOf('package');
    const revisionId = parts[packageIndex - 1] ?? '';
    const workspaceId = parts[packageIndex - 3] ?? '';
    const path = parts.slice(packageIndex + 1).map(decodeURIComponent).join('/');
    if (!UUID.test(revisionId) || packageIndex < 0) throw new AuthoringError(400, 'invalid_revision', 'A valid revision package is required.');
    await requireWorkspaceAction(request, workspaceId, 'story:read-draft');
    const entry = await revisionPackageEntry(workspaceId, revisionId, path);
    if (!entry) throw new AuthoringError(404, 'not_found', 'Package entry not found.');
    if (entry.kind === 'document') return Response.json(entry.document, { headers: { 'cache-control': 'private, no-store', etag: `"${entry.digest}"` } });
    const object = await get(entry.storagePath, {
      access: entry.storage === 'draft' ? 'private' : 'public',
      token: entry.storage === 'draft' ? draftBlobToken() : blobToken(), useCache: false,
    });
    if (!object || object.statusCode !== 200) throw new AuthoringError(404, 'not_found', 'Package asset not found.');
    return new Response(object.stream, { headers: {
      'content-type': entry.contentType, 'cache-control': 'private, no-store', etag: `"${entry.digest}"`,
      'x-content-type-options': 'nosniff',
    } });
  } catch (error) { return authoringError(error); }
}

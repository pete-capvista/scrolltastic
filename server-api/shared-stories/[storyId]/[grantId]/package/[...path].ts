import { get } from '@vercel/blob';
import { sharedRevisionPackageEntry } from '../../../../../src/authoring/workspace-repository.js';
import { draftBlobToken } from '../../../../../src/authoring/asset-service.js';
import { blobToken } from '../../../../publish/_shared.js';
import { authorizeSharedPackage, clearShareCookie, readShareCookie, ShareGrantError } from '../../../../../src/sharing/service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PACKAGE_PATH = /^(?:story\.json|(?:assets|cards)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:svg|png|jpg|jpeg|webp|avif))$/;

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const routed = url.searchParams.get('__route');
    const match = (routed ? `/api/${routed}` : url.pathname)
      .match(/^\/api\/shared-stories\/([^/]+)\/([^/]+)\/package\/(.+)$/);
    if (!match || !UUID.test(match[1]) || !UUID.test(match[2]) || !PACKAGE_PATH.test(match[3])) {
      return new Response('Not found.', { status: 404, headers: { 'cache-control': 'no-store' } });
    }
    const grant = await authorizeSharedPackage(readShareCookie(request), match[1], match[2]);
    const entry = await sharedRevisionPackageEntry(grant.workspaceId, grant.revisionId, grant.baseReleaseId, match[3]);
    if (!entry) return new Response('Not found.', { status: 404, headers: { 'cache-control': 'no-store' } });
    if (entry.kind === 'document') return Response.json(entry.document, { headers: {
      'cache-control': 'private, no-store', etag: `"${entry.digest}"`, 'x-content-type-options': 'nosniff',
    } });
    const object = await get(entry.storagePath, {
      access: entry.storage === 'draft' ? 'private' : 'public',
      token: entry.storage === 'draft' ? draftBlobToken() : blobToken(), useCache: false,
    });
    if (!object || object.statusCode !== 200) return new Response('Not found.', { status: 404, headers: { 'cache-control': 'no-store' } });
    return new Response(object.stream, { headers: {
      'content-type': entry.contentType, 'cache-control': 'private, no-store', etag: `"${entry.digest}"`,
      'x-content-type-options': 'nosniff',
    } });
  } catch (error) {
    if (error instanceof ShareGrantError) return new Response('Shared story unavailable.', {
      status: error.code === 'persistence_unavailable' ? 503 : 401,
      headers: { 'cache-control': 'no-store', 'set-cookie': clearShareCookie() },
    });
    return new Response('Shared story unavailable.', { status: 500, headers: { 'cache-control': 'no-store' } });
  }
}

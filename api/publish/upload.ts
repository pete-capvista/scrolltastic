import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { blobToken, errorResponse, PublishError, requirePublisher, stagingPrefix, verifyClaims, type UploadClaims } from './_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as HandleUploadBody;
    let publisher: string | undefined;
    if (body.type === 'blob.generate-client-token') publisher = await requirePublisher(request);
    const response = await handleUpload({
      request, body, token: blobToken(),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!publisher) throw new PublishError(401, 'unauthenticated', 'Sign in with GitHub to publish.');
        let payload: unknown;
        try { payload = JSON.parse(clientPayload ?? ''); } catch { throw new PublishError(400, 'invalid_manifest', 'The upload request is invalid.'); }
        if (!payload || typeof payload !== 'object') throw new PublishError(400, 'invalid_manifest', 'The upload request is invalid.');
        const record = payload as Record<string, unknown>;
        const claims = verifyClaims<UploadClaims>(record.uploadTicket, 'upload');
        if (claims.publisher !== publisher) throw new PublishError(403, 'forbidden', 'This upload belongs to another publisher.');
        const expected = `${stagingPrefix(claims.publisher, claims.publishId, claims.storyId)}${claims.file.path}`;
        if (pathname !== expected) throw new PublishError(400, 'invalid_manifest', 'The upload pathname is invalid.');
        return {
          allowedContentTypes: [claims.file.contentType], maximumSizeInBytes: claims.file.size,
          validUntil: claims.expiresAt, addRandomSuffix: false, allowOverwrite: true,
          cacheControlMaxAge: 60, tokenPayload: JSON.stringify({ uploadTicket: record.uploadTicket }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let payload: unknown;
        try { payload = JSON.parse(tokenPayload ?? ''); } catch { throw new PublishError(400, 'invalid_manifest', 'The upload completion is invalid.'); }
        const claims = verifyClaims<UploadClaims>((payload as Record<string, unknown>)?.uploadTicket, 'upload');
        const expected = `${stagingPrefix(claims.publisher, claims.publishId, claims.storyId)}${claims.file.path}`;
        if (blob.pathname !== expected) throw new PublishError(400, 'invalid_manifest', 'The completed upload pathname is invalid.');
      },
    });
    return Response.json(response);
  } catch (error) { return errorResponse(error); }
}

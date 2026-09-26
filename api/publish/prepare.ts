import { errorResponse, manifestHash, newPublishId, optionalHead, PublishError, requirePublisher, signClaims, validateBaseRevision, validateManifest, validateStoryId, type PublishClaims, type UploadClaims } from './_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const publisher = await requirePublisher(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') throw new PublishError(400, 'invalid_manifest', 'The publish request is invalid.');
    const record = body as Record<string, unknown>;
    const storyId = validateStoryId(record.storyId);
    const files = validateManifest(record.files);
    const requestedRevision = validateBaseRevision(record.baseRevision);
    if (record.force !== undefined && typeof record.force !== 'boolean') throw new PublishError(400, 'invalid_manifest', 'The overwrite choice is invalid.');
    const current = await optionalHead(`${storyId}/story.json`);
    if (!record.force && requestedRevision !== (current?.etag ?? null)) {
      throw new PublishError(409, 'revision_conflict', 'This story has changed since it was last published.');
    }
    const publishId = newPublishId();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const common = { publisher, publishId, storyId, expiresAt };
    const publishClaims: PublishClaims = { kind: 'publish', ...common, manifestHash: manifestHash(files), baseRevision: current?.etag ?? null };
    const uploadTickets = Object.fromEntries(files.map(file => {
      const claims: UploadClaims = { kind: 'upload', ...common, file };
      return [file.path, signClaims(claims)];
    }));
    return Response.json({ publisher, publishId, baseRevision: publishClaims.baseRevision, expiresAt, publishTicket: signClaims(publishClaims), uploadTickets });
  } catch (error) { return errorResponse(error); }
}

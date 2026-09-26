import { BlobPreconditionFailedError, copy, del } from '@vercel/blob';
import { blobToken, errorResponse, manifestHash, optionalHead, PublishError, readAndVerify, requirePublisher, stagingPrefix, validateManifest, validatePublishedStory, verifyClaims, type PublishClaims } from './_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const publisher = await requirePublisher(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') throw new PublishError(400, 'invalid_manifest', 'The commit request is invalid.');
    const record = body as Record<string, unknown>;
    const files = validateManifest(record.files);
    const claims = verifyClaims<PublishClaims>(record.publishTicket, 'publish');
    if (claims.publisher !== publisher) throw new PublishError(403, 'forbidden', 'This publish belongs to another publisher.');
    if (claims.manifestHash !== manifestHash(files)) throw new PublishError(400, 'invalid_manifest', 'The package differs from the prepared manifest.');
    const { storyId, publishId } = claims;
    const current = await optionalHead(`${storyId}/story.json`);
    if (claims.baseRevision !== (current?.etag ?? null)) throw new PublishError(409, 'revision_conflict', 'This story changed while it was uploading.');

    const prefix = stagingPrefix(publisher, publishId, storyId);
    let storyBytes: Uint8Array | undefined;
    for (const file of files) {
      const bytes = await readAndVerify(`${prefix}${file.path}`, file);
      if (file.path === 'story.json') storyBytes = bytes;
    }
    validatePublishedStory(storyBytes!, storyId, files);

    const assets = files.filter(file => file.path !== 'story.json');
    const story = files.find(file => file.path === 'story.json')!;
    const ordered = [...assets, story];
    const token = blobToken();
    for (const file of ordered) {
      await copy(`${prefix}${file.path}`, `_releases/${storyId}/${publishId}/${file.path}`, {
        access: 'public', token, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: file.contentType,
      });
    }
    let publishedStory;
    for (const file of ordered) {
      let result;
      try {
        result = await copy(`${prefix}${file.path}`, `${storyId}/${file.path}`, {
          access: 'public', token, addRandomSuffix: false,
          allowOverwrite: file.path === 'story.json' ? claims.baseRevision !== null : true,
          ...(file.path === 'story.json' && claims.baseRevision ? { ifMatch: claims.baseRevision } : {}),
          cacheControlMaxAge: 60, contentType: file.contentType,
        });
      } catch (error) {
        if (file.path === 'story.json' && (
          error instanceof BlobPreconditionFailedError
          || (claims.baseRevision === null && await optionalHead(`${storyId}/story.json`))
        )) throw new PublishError(409, 'revision_conflict', 'This story changed while it was uploading.');
        throw error;
      }
      if (file.path === 'story.json') publishedStory = result;
    }
    try { await del(files.map(file => `${prefix}${file.path}`), { token }); } catch (error) { console.warn('Staging cleanup failed', { publishId, error }); }
    return Response.json({
      storyId, publishId, releaseId: publishId, revision: publishedStory!.etag,
      readerUrl: `https://scrolltastic.vercel.app/s/${storyId}`, files: files.length,
      bytes: files.reduce((sum, file) => sum + file.size, 0),
    });
  } catch (error) { return errorResponse(error); }
}

import { revisionDocument } from '../../../../../src/authoring/workspace-repository.js';
import { authoringError, AuthoringError, requireWorkspaceAction, UUID } from '../../../../authoring/_shared.js';

export async function GET(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const revisionId = parts.at(-2) ?? '';
    const workspaceId = parts.at(-4) ?? '';
    if (!UUID.test(revisionId)) throw new AuthoringError(400, 'invalid_revision', 'A valid revision ID is required.');
    await requireWorkspaceAction(request, workspaceId, 'story:read-draft');
    const revision = await revisionDocument(workspaceId, revisionId);
    if (!revision) throw new AuthoringError(404, 'not_found', 'Revision not found.');
    return Response.json(revision.document, { headers: { 'cache-control': 'private, no-store', etag: `"${revision.digest}"` } });
  } catch (error) { return authoringError(error); }
}

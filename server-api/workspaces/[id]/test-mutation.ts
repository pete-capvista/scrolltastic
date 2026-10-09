import { createTestTitleRevision } from '../../../src/authoring/workspace-repository.js';
import { authoringError, AuthoringError, parseJsonRequest, requireWorkspaceAction } from '../../authoring/_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const workspaceId = parts.at(-2) ?? '';
    const body = await parseJsonRequest(request, 8 * 1024);
    const title = body && typeof body === 'object' ? (body as Record<string, unknown>).title : undefined;
    if (typeof title !== 'string') throw new AuthoringError(400, 'invalid_mutation', 'A title is required.');
    const { principal } = await requireWorkspaceAction(request, workspaceId, 'story:edit');
    return Response.json(await createTestTitleRevision(workspaceId, title, principal), { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) { return authoringError(error); }
}

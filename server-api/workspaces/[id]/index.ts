import { authoringError, requireWorkspaceAction } from '../../authoring/_shared.js';

export async function GET(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const workspaceId = parts.at(-1) ?? '';
    const { workspace } = await requireWorkspaceAction(request, workspaceId, 'story:read-draft');
    return Response.json({ workspace }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) { return authoringError(error); }
}

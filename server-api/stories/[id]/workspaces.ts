import { createOrResumeWorkspace } from '../../../src/authoring/workspace-repository.js';
import { blobToken } from '../../publish/_shared.js';
import { authoringError, requireStoryAction } from '../../authoring/_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const storyId = parts.at(-2) ?? '';
    const principal = await requireStoryAction(request, storyId, 'story:edit');
    const workspace = await createOrResumeWorkspace(storyId, principal, blobToken());
    return Response.json({ workspace }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) { return authoringError(error); }
}

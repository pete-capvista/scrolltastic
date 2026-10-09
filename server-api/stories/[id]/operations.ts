import { storyOperationsSummary } from '../../../src/operations/dashboard.js';
import { authoringError, requireStoryAction } from '../../authoring/_shared.js';

export async function GET(request: Request): Promise<Response> {
  try {
    const storyId = new URL(request.url).pathname.split('/').filter(Boolean).at(-2) ?? '';
    await requireStoryAction(request, storyId, 'story:memory-approve');
    return Response.json({ operations: await storyOperationsSummary(storyId) }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) { return authoringError(error); }
}

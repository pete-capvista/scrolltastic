import { MemoryError, reviewStoryMemory } from '../../../../../src/memory/service.js';
import { authoringError, AuthoringError, parseJsonRequest, requireStoryAction, UUID } from '../../../../authoring/_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const storyId = parts.at(-4) ?? ''; const memoryId = parts.at(-2) ?? '';
    if (!UUID.test(storyId) || !UUID.test(memoryId)) throw new AuthoringError(400, 'invalid_memory', 'Valid story and memory IDs are required.');
    const actor = await requireStoryAction(request, storyId, 'story:memory-approve');
    const body = await parseJsonRequest(request, 16 * 1024) as { decision?: unknown; value?: unknown };
    if (body.decision !== 'approved' && body.decision !== 'rejected') throw new AuthoringError(400, 'invalid_decision', 'Memory must be approved or rejected.');
    const memory = await reviewStoryMemory(storyId, memoryId, actor.accountId, body.decision, body.value);
    return Response.json({ memory }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof MemoryError) return authoringError(new AuthoringError(error.code === 'memory_not_reviewable' ? 409 : error.code === 'persistence_unavailable' ? 503 : 400, error.code, error.message));
    return authoringError(error);
  }
}

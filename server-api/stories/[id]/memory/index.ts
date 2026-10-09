import { listStoryMemory, MemoryError, proposeStoryMemory } from '../../../../src/memory/service.js';
import { MemoryValidationError } from '../../../../src/memory/validation.js';
import { authoringError, AuthoringError, parseJsonRequest, requireStoryAction, UUID } from '../../../authoring/_shared.js';

function storyId(request: Request): string {
  const value = new URL(request.url).pathname.split('/').filter(Boolean).at(-2) ?? '';
  if (!UUID.test(value)) throw new AuthoringError(400, 'invalid_story', 'A valid story ID is required.');
  return value;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const id = storyId(request); await requireStoryAction(request, id, 'story:read-draft');
    const status = new URL(request.url).searchParams.get('status') ?? undefined;
    if (status && !['proposed', 'approved', 'rejected', 'invalidated'].includes(status)) throw new AuthoringError(400, 'invalid_status', 'The memory status is invalid.');
    return Response.json({ memory: await listStoryMemory(id, status as never) }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof MemoryError || error instanceof MemoryValidationError) return authoringError(new AuthoringError(error.code === 'persistence_unavailable' ? 503 : 400, error.code, error.message));
    return authoringError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const id = storyId(request); const actor = await requireStoryAction(request, id, 'story:memory-propose');
    const body = await parseJsonRequest(request, 16 * 1024) as { sourceRevisionId?: unknown; proposal?: unknown };
    if (typeof body.sourceRevisionId !== 'string' || !UUID.test(body.sourceRevisionId)) throw new AuthoringError(400, 'invalid_revision', 'A valid source revision ID is required.');
    const memory = await proposeStoryMemory(id, body.sourceRevisionId, actor.accountId, body.proposal);
    return Response.json({ memory }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof MemoryError || error instanceof MemoryValidationError) return authoringError(new AuthoringError(error.code === 'persistence_unavailable' ? 503 : 400, error.code, error.message));
    return authoringError(error);
  }
}

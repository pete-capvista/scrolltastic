import { waitUntil } from '@vercel/functions';
import {
  conversationWorkspace, createGeneration, GenerationError, runGeneration,
} from '../../../src/ai/generation-service.js';
import { authoringError, AuthoringError, parseJsonRequest, requireWorkspaceAction, UUID } from '../../authoring/_shared.js';
import { logOperationalEvent } from '../../../src/observability/events.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const conversationId = parts.at(-2) ?? '';
    if (!UUID.test(conversationId)) throw new AuthoringError(400, 'invalid_conversation', 'A valid conversation ID is required.');
    const workspaceId = await conversationWorkspace(conversationId);
    if (!workspaceId) throw new AuthoringError(404, 'not_found', 'Conversation not found.');
    const { principal } = await requireWorkspaceAction(request, workspaceId, 'story:prompt-ai');
    const body = await parseJsonRequest(request, 64 * 1024);
    if (!body || typeof body !== 'object') throw new AuthoringError(400, 'invalid_prompt', 'A generation request is required.');
    const idempotencyKey = request.headers.get('idempotency-key') ?? '';
    const generationInput = body as { prompt: unknown; selectedId?: unknown; selectedAssetIds?: unknown; mode?: unknown };
    if (generationInput.mode === 'publisher') await requireWorkspaceAction(request, workspaceId, 'story:publish');
    const { generation, replayed } = await createGeneration(conversationId, principal, generationInput, idempotencyKey);
    if (!replayed && generation.status === 'pending') waitUntil(runGeneration(generation.id).catch(() => logOperationalEvent({ event: 'generation.background', outcome: 'failed', generationId: generation.id, errorCode: 'generation_failure' })));
    return Response.json({ generation }, { status: replayed ? 200 : 202, headers: { 'cache-control': 'no-store', location: `/api/generations/${generation.id}` } });
  } catch (error) {
    if (error instanceof GenerationError) {
      const status = error.code === 'generation_quota' || error.code === 'generation_concurrency' || error.code === 'generation_rate_limit' ? 429
        : error.code === 'idempotency_conflict' || error.code === 'request_in_progress' ? 409 : 400;
      return authoringError(new AuthoringError(status, error.code, error.message));
    }
    return authoringError(error);
  }
}

import { cancelGeneration, generationRecord } from '../../../src/ai/generation-service.js';
import { authoringError, AuthoringError, requireWorkspaceAction, UUID } from '../../authoring/_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const generationId = parts.at(-2) ?? '';
    if (!UUID.test(generationId)) throw new AuthoringError(400, 'invalid_generation', 'A valid generation ID is required.');
    const generation = await generationRecord(generationId);
    if (!generation) throw new AuthoringError(404, 'not_found', 'Generation not found.');
    await requireWorkspaceAction(request, generation.workspaceId, 'story:prompt-ai');
    if (!await cancelGeneration(generationId)) throw new AuthoringError(409, 'generation_terminal', 'The generation has already finished.');
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  } catch (error) { return authoringError(error); }
}

import { createConversation, GenerationError } from '../../../src/ai/generation-service.js';
import { authoringError, AuthoringError, requireWorkspaceAction } from '../../authoring/_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const workspaceId = parts.at(-2) ?? '';
    const { principal } = await requireWorkspaceAction(request, workspaceId, 'story:prompt-ai');
    return Response.json({ conversation: await createConversation(workspaceId, principal) }, {
      status: 201, headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof GenerationError) return authoringError(new AuthoringError(409, error.code, error.message));
    return authoringError(error);
  }
}

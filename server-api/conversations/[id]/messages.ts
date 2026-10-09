import { conversationMessages, conversationWorkspace } from '../../../src/ai/generation-service.js';
import { authoringError, AuthoringError, requireWorkspaceAction, UUID } from '../../authoring/_shared.js';

export async function GET(request: Request): Promise<Response> {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const conversationId = parts.at(-2) ?? '';
    if (!UUID.test(conversationId)) throw new AuthoringError(400, 'invalid_conversation', 'A valid conversation ID is required.');
    const workspaceId = await conversationWorkspace(conversationId);
    if (!workspaceId) throw new AuthoringError(404, 'not_found', 'Conversation not found.');
    await requireWorkspaceAction(request, workspaceId, 'story:read-draft');
    return Response.json({ messages: await conversationMessages(conversationId) }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) { return authoringError(error); }
}

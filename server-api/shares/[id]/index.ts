import { AuthoringError, authoringError, requireStoryAction, UUID } from '../../authoring/_shared.js';
import { revokeRevisionShare, shareGrantStoryId, ShareGrantError } from '../../../src/sharing/service.js';

export async function DELETE(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const routed = url.searchParams.get('__route');
    const grantId = routed?.match(/^shares\/([^/]+)$/)?.[1] ?? url.pathname.split('/').filter(Boolean).at(-1);
    if (!grantId || !UUID.test(grantId)) throw new AuthoringError(400, 'invalid_share', 'A valid share ID is required.');
    const storyId = await shareGrantStoryId(grantId);
    if (!storyId) throw new AuthoringError(404, 'not_found', 'Share not found.');
    const principal = await requireStoryAction(request, storyId, 'story:publish');
    if (!await revokeRevisionShare(grantId, principal)) throw new AuthoringError(404, 'not_found', 'Share not found.');
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof ShareGrantError) return authoringError(new AuthoringError(503, error.code, error.message));
    return authoringError(error);
  }
}

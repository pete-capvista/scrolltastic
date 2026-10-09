import { BlobNotFoundError, get } from '@vercel/blob';
import { authenticateRequest, AuthenticationError } from '../../../src/auth/identity.js';
import { storyAuthorization } from '../../../src/auth/policy.js';
import { storyMembershipRepository, storyOrganizationId } from '../../../src/persistence/postgres.js';
import { parseStory } from '../../../src/parser/parse.js';
import { blobToken, STORY_ID } from '../../publish/_shared.js';
import { storyCapabilities } from '../../../src/authoring/capabilities.js';
import { filterActionsForRollout } from '../../../src/auth/rollout.js';
import { logOperationalEvent } from '../../../src/observability/events.js';

function storyIdFromRequest(request: Request): string | undefined {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  const value = parts.at(-2);
  return value && STORY_ID.test(value) ? value : undefined;
}

export async function GET(request: Request): Promise<Response> {
  const storyId = storyIdFromRequest(request);
  if (!storyId) return Response.json({ error: { code: 'invalid_story', message: 'A valid story ID is required.' } }, { status: 400 });
  try {
    const result = await get(`${storyId}/story.json`, { access: 'public', token: blobToken(), useCache: false });
    if (!result || result.statusCode !== 200) return Response.json({ error: { code: 'not_found', message: 'Story not found.' } }, { status: 404 });
    const document = parseStory(await new Response(result.stream).text());
    const principal = await authenticateRequest(request);
    const authorization = principal
      ? await storyAuthorization(storyMembershipRepository(), storyId, principal)
      : { actions: [] as const };
    const rolledOut = principal?.accountId
      ? { ...authorization, actions: filterActionsForRollout(authorization.actions, { accountId: principal.accountId, storyId, organizationId: await storyOrganizationId(storyId) }) }
      : authorization;
    const capabilities = storyCapabilities(document, rolledOut);
    return Response.json({
      authenticated: Boolean(principal),
      ...capabilities,
    }, { headers: { 'cache-control': 'private, no-store', vary: 'Cookie, Authorization' } });
  } catch (error) {
    if (error instanceof BlobNotFoundError) return Response.json({ error: { code: 'not_found', message: 'Story not found.' } }, { status: 404 });
    if (error instanceof AuthenticationError) return Response.json({ error: { code: 'unauthenticated', message: error.message } }, { status: error.status });
    logOperationalEvent({ event: 'capabilities.lookup', outcome: 'failed', storyId, errorCode: 'internal_error' });
    return Response.json({ error: { code: 'internal_error', message: 'Story capabilities are unavailable.' } }, { status: 500 });
  }
}

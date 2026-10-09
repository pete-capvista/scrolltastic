import { createNostrChallenge, NostrAuthenticationError } from '../../../src/auth/nostr.js';
import { logOperationalEvent } from '../../../src/observability/events.js';
import { AuthoringError, authoringError, parseJsonRequest } from '../../authoring/_shared.js';
import { RequestSecurityError, requireTrustedMutationOrigin } from '../../../src/auth/request-security.js';

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedMutationOrigin(request);
    const body = await parseJsonRequest(request, 2 * 1024) as { returnPath?: unknown };
    const returnPath = body && typeof body.returnPath === 'string' ? body.returnPath : '/';
    const challenge = await createNostrChallenge(request, returnPath);
    logOperationalEvent({ event: 'authentication.nostr.challenge', outcome: 'completed' });
    return Response.json({ challenge }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof RequestSecurityError) return authoringError(new AuthoringError(403, 'forbidden_origin', error.message));
    if (error instanceof NostrAuthenticationError) {
      const status = error.code === 'authentication_rate_limit' ? 429 : error.code.includes('unavailable') || error.code === 'configuration_error' ? 503 : 400;
      return authoringError(new AuthoringError(status, error.code, error.message));
    }
    return authoringError(error);
  }
}

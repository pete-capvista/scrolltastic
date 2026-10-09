import { consumeNostrLogin, NostrAuthenticationError } from '../../../src/auth/nostr.js';
import { RequestSecurityError, requireTrustedMutationOrigin } from '../../../src/auth/request-security.js';
import { createSessionToken, sessionCookie } from '../../../src/auth/session.js';
import { logOperationalEvent } from '../../../src/observability/events.js';
import { AuthoringError, authoringError, parseJsonRequest } from '../../authoring/_shared.js';

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedMutationOrigin(request);
    const input = await parseJsonRequest(request, 16 * 1024) as { proof?: unknown; event?: unknown };
    const result = await consumeNostrLogin(request, input);
    const token = createSessionToken(result.principal);
    logOperationalEvent({ event: 'authentication.nostr.session', outcome: 'completed' });
    return Response.json({
      authenticated: true,
      account: { id: result.principal.accountId, displayName: result.principal.displayName, provider: 'nostr' },
      returnPath: result.returnPath,
    }, { headers: { 'cache-control': 'no-store', 'set-cookie': sessionCookie(token) } });
  } catch (error) {
    if (error instanceof RequestSecurityError) return authoringError(new AuthoringError(403, 'forbidden_origin', error.message));
    if (error instanceof NostrAuthenticationError) {
      const status = error.code.includes('unavailable') || error.code === 'configuration_error' ? 503
        : error.code === 'expired_nostr_challenge' || error.code === 'expired_nostr_event' ? 409 : 401;
      logOperationalEvent({ event: 'authentication.nostr.session', outcome: 'failed', errorCode: error.code });
      return authoringError(new AuthoringError(status, error.code, error.message));
    }
    return authoringError(error);
  }
}

import { AuthoringError, authoringError, parseJsonRequest } from '../authoring/_shared.js';
import { RequestSecurityError, requireTrustedMutationOrigin } from '../../src/auth/request-security.js';
import { clearShareCookie, redeemRevisionShare, shareCookie, ShareGrantError } from '../../src/sharing/service.js';

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedMutationOrigin(request);
    const body = await parseJsonRequest(request, 2 * 1024) as { token?: unknown };
    if (typeof body.token !== 'string') throw new AuthoringError(400, 'invalid_share', 'A share token is required.');
    const grant = await redeemRevisionShare(body.token);
    return Response.json({ readerUrl: `/s/${grant.storyId}/shared/${grant.id}` }, {
      headers: {
        'set-cookie': shareCookie(body.token, new Date(grant.expiresAt)),
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (error) {
    if (error instanceof RequestSecurityError) return authoringError(new AuthoringError(403, 'forbidden_origin', error.message));
    if (error instanceof AuthoringError) return authoringError(error);
    if (error instanceof ShareGrantError) return Response.json({ error: { code: 'share_unavailable', message: error.message } }, {
      status: error.code === 'persistence_unavailable' ? 503 : 410,
      headers: { 'cache-control': 'no-store', 'set-cookie': clearShareCookie() },
    });
    return authoringError(error);
  }
}

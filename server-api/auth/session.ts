import { verifyOidcIdToken } from '../../src/auth/oidc.js';
import { clearSessionCookie, createSessionToken, sessionCookie } from '../../src/auth/session.js';
import { RequestSecurityError, requireTrustedMutationOrigin } from '../../src/auth/request-security.js';
import { upsertAccount } from '../../src/persistence/postgres.js';

function failure(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedMutationOrigin(request);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return failure(415, 'unsupported_media_type', 'Expected a JSON request.');
    }
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > 16_384) return failure(413, 'request_too_large', 'The session request is too large.');
    const body: unknown = await request.json();
    const idToken = body && typeof body === 'object' ? (body as Record<string, unknown>).idToken : undefined;
    if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 12_000) {
      return failure(400, 'invalid_identity_token', 'A valid identity token is required.');
    }
    const account = await upsertAccount(await verifyOidcIdToken(idToken));
    const token = createSessionToken(account);
    return Response.json({ authenticated: true, account: { id: account.accountId, displayName: account.displayName } }, {
      headers: { 'cache-control': 'no-store', 'set-cookie': sessionCookie(token) },
    });
  } catch (error) {
    if (error instanceof RequestSecurityError) return failure(403, 'forbidden_origin', error.message);
    console.error('Session creation failed', error);
    return failure(401, 'authentication_failed', 'The identity token could not be verified.');
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try { requireTrustedMutationOrigin(request); }
  catch (error) {
    return failure(403, 'forbidden_origin', error instanceof Error ? error.message : 'The request origin is not allowed.');
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store', 'set-cookie': clearSessionCookie() } });
}

export class RequestSecurityError extends Error {}

export function requireTrustedMutationOrigin(request: Request, configuredOrigin = process.env.SCROLLTASTIC_APP_ORIGIN): void {
  if (!configuredOrigin) throw new RequestSecurityError('Mutation origin validation is unavailable.');
  let expected: URL;
  try { expected = new URL(configuredOrigin); }
  catch { throw new RequestSecurityError('Mutation origin validation is unavailable.'); }
  if (expected.pathname !== '/' || expected.search || expected.hash || expected.username || expected.password) {
    throw new RequestSecurityError('Mutation origin validation is unavailable.');
  }
  const supplied = request.headers.get('origin');
  if (!supplied || supplied !== expected.origin) throw new RequestSecurityError('The request origin is not allowed.');
}

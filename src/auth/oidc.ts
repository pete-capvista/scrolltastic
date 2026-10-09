import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface OidcIdentity {
  provider: 'oidc';
  subject: string;
  displayName?: string;
}

export async function verifyOidcIdToken(token: string): Promise<OidcIdentity> {
  const issuer = process.env.SCROLLTASTIC_OIDC_ISSUER;
  const audience = process.env.SCROLLTASTIC_OIDC_AUDIENCE;
  const jwksUrl = process.env.SCROLLTASTIC_OIDC_JWKS_URL;
  if (!issuer || !audience || !jwksUrl) throw new Error('OIDC authentication is unavailable.');
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  const { payload } = await jwtVerify(token, jwks, { issuer, audience });
  if (!payload.sub || payload.sub.length > 500) throw new Error('The identity token has no valid subject.');
  const displayName = typeof payload.name === 'string'
    ? payload.name
    : typeof payload.preferred_username === 'string' ? payload.preferred_username : undefined;
  return { provider: 'oidc', subject: payload.sub, ...(displayName ? { displayName: displayName.slice(0, 200) } : {}) };
}

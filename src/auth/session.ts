import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Principal } from './model.js';

export const SESSION_COOKIE = 'scrolltastic_session';

interface SessionClaims extends Principal {
  issuedAt: number;
  expiresAt: number;
}

export class SessionError extends Error {}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sessionSecret(explicit?: string): string {
  const value = explicit ?? process.env.SCROLLTASTIC_SESSION_SECRET;
  if (!value || value.length < 32) throw new SessionError('Browser session verification is unavailable.');
  return value;
}

export function createSessionToken(
  principal: Principal & { accountId: string },
  options: { now?: number; maxAgeMs?: number; secret?: string } = {},
): string {
  const now = options.now ?? Date.now();
  const claims: SessionClaims = { ...principal, issuedAt: now, expiresAt: now + (options.maxAgeMs ?? 8 * 60 * 60 * 1000) };
  const payload = encode(claims);
  const signature = createHmac('sha256', sessionSecret(options.secret)).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string, options: { now?: number; secret?: string } = {}): Principal & { accountId: string } {
  const [payload, supplied, extra] = token.split('.');
  if (!payload || !supplied || extra) throw new SessionError('The browser session is invalid.');
  const expected = createHmac('sha256', sessionSecret(options.secret)).update(payload).digest();
  const actual = Buffer.from(supplied, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new SessionError('The browser session is invalid.');
  let claims: unknown;
  try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { throw new SessionError('The browser session is invalid.'); }
  if (!claims || typeof claims !== 'object') throw new SessionError('The browser session is invalid.');
  const value = claims as Record<string, unknown>;
  const now = options.now ?? Date.now();
  if (
    typeof value.accountId !== 'string' || !value.accountId
    || typeof value.provider !== 'string' || !value.provider
    || typeof value.subject !== 'string' || !value.subject
    || !Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt)
    || (value.issuedAt as number) > now + 60_000 || (value.expiresAt as number) <= now
  ) throw new SessionError('The browser session is invalid or expired.');
  return {
    accountId: value.accountId,
    provider: value.provider,
    subject: value.subject,
    ...(typeof value.displayName === 'string' ? { displayName: value.displayName } : {}),
  };
}

export function readSessionCookie(request: Request): string | undefined {
  const cookie = request.headers.get('cookie');
  if (!cookie) return undefined;
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=');
  }
  return undefined;
}

export function sessionCookie(token: string, maxAgeSeconds = 8 * 60 * 60): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

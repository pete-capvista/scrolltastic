import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { nip19, validateEvent, verifyEvent, type Event } from 'nostr-tools';
import { database } from '../persistence/postgres.js';
import type { Principal } from './model.js';

const LOGIN_KIND = 27235;
const CHALLENGE_LIFETIME_SECONDS = 120;
const DEFAULT_CHALLENGES_PER_MINUTE = 10;
const HEX_32 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class NostrAuthenticationError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface NostrChallenge {
  id: string;
  challenge: string;
  expiresAt: string;
  createdAt: number;
  loginUrl: string;
}

export interface NostrLoginProof { challengeId: string; challenge: string }

function requiredDatabase() {
  const sql = database();
  if (!sql) throw new NostrAuthenticationError('persistence_unavailable', 'Nostr authentication persistence is unavailable.');
  return sql;
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new NostrAuthenticationError('configuration_error', `${name} must be a positive integer.`);
  return value;
}

export function nostrLoginUrl(origin = process.env.SCROLLTASTIC_APP_ORIGIN): string {
  if (!origin) throw new NostrAuthenticationError('configuration_error', 'The application origin is unavailable.');
  const url = new URL(origin);
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new NostrAuthenticationError('configuration_error', 'The application origin is invalid.');
  return new URL('/api/auth/nostr/session', url.origin).href;
}

function challengeDigest(challenge: string): string {
  return createHash('sha256').update(challenge).digest('hex');
}

export function canonicalNostrProof(proof: NostrLoginProof): string {
  return JSON.stringify({ challengeId: proof.challengeId, challenge: proof.challenge });
}

export function nostrProofDigest(proof: NostrLoginProof): string {
  return createHash('sha256').update(canonicalNostrProof(proof)).digest('hex');
}

export function requestFingerprint(request: Request): string {
  const secret = process.env.SCROLLTASTIC_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new NostrAuthenticationError('configuration_error', 'Authentication rate limiting is unavailable.');
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  const address = forwarded || (request.headers.get('x-real-ip') ?? 'unknown');
  const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? '';
  return createHmac('sha256', secret).update(`${address}\n${userAgent}`).digest('hex');
}

function exactTag(event: Event, name: string): string {
  const values = event.tags.filter(tag => tag[0] === name && typeof tag[1] === 'string');
  if (values.length !== 1 || values[0].length !== 2) throw new NostrAuthenticationError('invalid_nostr_event', `The signed event requires exactly one ${name} tag.`);
  return values[0][1];
}

export function validateNostrLoginEvent(
  event: unknown,
  proof: NostrLoginProof,
  expected: { loginUrl: string; nowSeconds?: number },
): Event {
  let candidate: unknown;
  try { candidate = JSON.parse(JSON.stringify(event)); }
  catch { throw new NostrAuthenticationError('invalid_nostr_signature', 'The Nostr login signature is invalid.'); }
  if (!candidate || typeof candidate !== 'object' || !validateEvent(candidate)
    || typeof (candidate as { id?: unknown }).id !== 'string' || typeof (candidate as { sig?: unknown }).sig !== 'string'
    || !verifyEvent(candidate as Event)) throw new NostrAuthenticationError('invalid_nostr_signature', 'The Nostr login signature is invalid.');
  const signed = candidate as Event;
  const now = expected.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (signed.kind !== LOGIN_KIND || signed.content !== '') throw new NostrAuthenticationError('invalid_nostr_event', 'The signed event is not a Nostr HTTP authentication event.');
  if (!HEX_32.test(signed.pubkey)) throw new NostrAuthenticationError('invalid_nostr_event', 'The Nostr public key is invalid.');
  if (!Number.isSafeInteger(signed.created_at) || Math.abs(now - signed.created_at) > CHALLENGE_LIFETIME_SECONDS) throw new NostrAuthenticationError('expired_nostr_event', 'The Nostr login event has expired.');
  if (exactTag(signed, 'u') !== expected.loginUrl || exactTag(signed, 'method') !== 'POST') throw new NostrAuthenticationError('invalid_nostr_binding', 'The Nostr login event is bound to a different request.');
  if (exactTag(signed, 'challenge') !== proof.challenge) throw new NostrAuthenticationError('invalid_nostr_challenge', 'The Nostr login challenge does not match.');
  if (exactTag(signed, 'payload') !== nostrProofDigest(proof)) throw new NostrAuthenticationError('invalid_nostr_binding', 'The Nostr login payload digest does not match.');
  return signed;
}

export async function createNostrChallenge(request: Request, returnPath = '/'): Promise<NostrChallenge> {
  if (!returnPath.startsWith('/') || returnPath.startsWith('//') || returnPath.length > 1_000 || /[\\\u0000-\u001f]/.test(returnPath)) throw new NostrAuthenticationError('invalid_return_path', 'The authentication return path is invalid.');
  const sql = requiredDatabase();
  const fingerprint = requestFingerprint(request);
  const limit = positiveInteger('SCROLLTASTIC_AUTH_CHALLENGES_PER_MINUTE', DEFAULT_CHALLENGES_PER_MINUTE);
  const id = randomUUID();
  const challenge = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + CHALLENGE_LIFETIME_SECONDS * 1000);
  await sql.begin(async transaction => {
    await transaction`select pg_advisory_xact_lock(hashtext(${`nostr-auth:${fingerprint}`}))`;
    const rows = await transaction<{ count: number }[]>`
      select count(*)::int as count from authentication_challenges
      where client_fingerprint = ${fingerprint} and created_at > now() - interval '1 minute'`;
    if (rows[0].count >= limit) throw new NostrAuthenticationError('authentication_rate_limit', 'Too many authentication challenges were requested.');
    await transaction`
      insert into authentication_challenges
        (id, provider, challenge_digest, client_fingerprint, return_path, expires_at)
      values (${id}, 'nostr', ${challengeDigest(challenge)}, ${fingerprint}, ${returnPath}, ${expiresAt})`;
  });
  return { id, challenge, expiresAt: expiresAt.toISOString(), createdAt: Math.floor(Date.now() / 1000), loginUrl: nostrLoginUrl() };
}

export async function consumeNostrLogin(
  request: Request,
  input: { proof?: unknown; event?: unknown },
): Promise<{ principal: Principal & { accountId: string }; returnPath: string }> {
  const proof = input.proof;
  if (!proof || typeof proof !== 'object') throw new NostrAuthenticationError('invalid_nostr_challenge', 'A Nostr login proof is required.');
  const value = proof as Record<string, unknown>;
  if (typeof value.challengeId !== 'string' || !UUID.test(value.challengeId) || typeof value.challenge !== 'string' || !HEX_32.test(value.challenge)) throw new NostrAuthenticationError('invalid_nostr_challenge', 'The Nostr login challenge is invalid.');
  const normalized = { challengeId: value.challengeId, challenge: value.challenge };
  const event = validateNostrLoginEvent(input.event, normalized, { loginUrl: nostrLoginUrl() });
  const fingerprint = requestFingerprint(request);
  const sql = requiredDatabase();
  return sql.begin(async transaction => {
    const rows = await transaction<{ challenge_digest: string; client_fingerprint: string; return_path: string }[]>`
      select challenge_digest, client_fingerprint, return_path from authentication_challenges
      where id = ${normalized.challengeId}::uuid and provider = 'nostr' and consumed_at is null and expires_at > now()
      for update`;
    const challenge = rows[0];
    if (!challenge) throw new NostrAuthenticationError('expired_nostr_challenge', 'The Nostr login challenge is missing, expired, or already used.');
    const expected = Buffer.from(challenge.challenge_digest, 'hex');
    const actual = Buffer.from(challengeDigest(normalized.challenge), 'hex');
    if (!timingSafeEqual(expected, actual) || challenge.client_fingerprint !== fingerprint) throw new NostrAuthenticationError('invalid_nostr_challenge', 'The Nostr login challenge is invalid for this client.');
    await transaction`update authentication_challenges set consumed_at = now() where id = ${normalized.challengeId}`;
    const accounts = await transaction<{ id: string; displayName?: string; status: string }[]>`
      insert into accounts (id, identity_provider, provider_subject, display_name, status)
      values (${randomUUID()}, 'nostr', ${event.pubkey}, ${nip19.npubEncode(event.pubkey)}, 'active')
      on conflict (identity_provider, provider_subject) do update set display_name = accounts.display_name
      returning id, display_name as "displayName", status`;
    if (!accounts[0] || accounts[0].status !== 'active') throw new NostrAuthenticationError('account_unavailable', 'The Nostr account is not active.');
    return {
      principal: { accountId: accounts[0].id, provider: 'nostr', subject: event.pubkey, displayName: accounts[0].displayName },
      returnPath: challenge.return_path,
    };
  });
}

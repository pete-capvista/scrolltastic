import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import {
  canonicalNostrProof, NostrAuthenticationError, nostrProofDigest, validateNostrLoginEvent,
} from '../src/auth/nostr';

const loginUrl = 'https://scrolltastic.test/api/auth/nostr/session';
const proof = { challengeId: '11111111-1111-4111-8111-111111111111', challenge: 'a'.repeat(64) };
const now = 1_790_000_000;

function signed(overrides: { kind?: number; created_at?: number; content?: string; tags?: string[][] } = {}) {
  return finalizeEvent({
    kind: overrides.kind ?? 27235, created_at: overrides.created_at ?? now, content: overrides.content ?? '',
    tags: overrides.tags ?? [['u', loginUrl], ['method', 'POST'], ['challenge', proof.challenge], ['payload', nostrProofDigest(proof)]],
  }, generateSecretKey());
}

describe('Nostr authentication proof', () => {
  it('accepts a valid NIP-98-style proof bound to URL, method, payload and one-time challenge', () => {
    const event = signed();
    expect(validateNostrLoginEvent(event, proof, { loginUrl, nowSeconds: now }).pubkey).toBe(event.pubkey);
    expect(canonicalNostrProof(proof)).toBe(`{"challengeId":"${proof.challengeId}","challenge":"${proof.challenge}"}`);
  });

  it.each([
    ['wrong kind', () => signed({ kind: 1 }), 'invalid_nostr_event'],
    ['expired timestamp', () => signed({ created_at: now - 121 }), 'expired_nostr_event'],
    ['wrong URL', () => signed({ tags: [['u', 'https://evil.test/api/auth/nostr/session'], ['method', 'POST'], ['challenge', proof.challenge], ['payload', nostrProofDigest(proof)]] }), 'invalid_nostr_binding'],
    ['wrong method', () => signed({ tags: [['u', loginUrl], ['method', 'GET'], ['challenge', proof.challenge], ['payload', nostrProofDigest(proof)]] }), 'invalid_nostr_binding'],
    ['wrong challenge', () => signed({ tags: [['u', loginUrl], ['method', 'POST'], ['challenge', 'b'.repeat(64)], ['payload', nostrProofDigest(proof)]] }), 'invalid_nostr_challenge'],
    ['wrong payload', () => signed({ tags: [['u', loginUrl], ['method', 'POST'], ['challenge', proof.challenge], ['payload', 'b'.repeat(64)]] }), 'invalid_nostr_binding'],
    ['duplicate binding', () => signed({ tags: [['u', loginUrl], ['u', loginUrl], ['method', 'POST'], ['challenge', proof.challenge], ['payload', nostrProofDigest(proof)]] }), 'invalid_nostr_event'],
  ])('rejects %s', (_name, event, code) => {
    expect(() => validateNostrLoginEvent(event(), proof, { loginUrl, nowSeconds: now })).toThrow(expect.objectContaining({ code }) as NostrAuthenticationError);
  });

  it('rejects signature tampering', () => {
    const event = JSON.parse(JSON.stringify(signed())) as ReturnType<typeof signed>;
    expect(() => validateNostrLoginEvent({ ...event, content: 'tampered' }, proof, { loginUrl, nowSeconds: now })).toThrow('signature');
  });
});

describe('Nostr challenge persistence', () => {
  const migration = readFileSync('db/migrations/0006_nostr_authentication.sql', 'utf8');

  it('stores digests, fingerprints, expiry and one-time consumption state', () => {
    expect(migration).toContain('challenge_digest');
    expect(migration).toContain('client_fingerprint');
    expect(migration).toContain('expires_at');
    expect(migration).toContain('consumed_at');
    expect(migration).not.toMatch(/private_key|secret_key|nsec/i);
  });
});

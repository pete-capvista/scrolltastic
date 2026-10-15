import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearShareCookie, newShareToken, readShareCookie, SHARE_COOKIE, shareCookie, shareTokenDigest,
} from '../src/sharing/service';

afterEach(() => vi.useRealTimers());

describe('short-lived revision sharing', () => {
  it('creates unguessable URL-safe tokens and stores only deterministic digests', () => {
    const first = newShareToken();
    const second = newShareToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(shareTokenDigest(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(shareTokenDigest(first)).not.toContain(first);
    expect(() => shareTokenDigest('short')).toThrow('invalid');
  });

  it('uses an expiring secure HttpOnly cookie and can clear it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = newShareToken();
    const cookie = shareCookie(token, new Date('2026-01-01T00:30:00Z'));
    expect(cookie).toContain(`${SHARE_COOKIE}=${token}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=1800');
    expect(readShareCookie(new Request('https://scrolltastic.test', { headers: { cookie } }))).toBe(token);
    expect(clearShareCookie()).toContain('Max-Age=0');
  });

  it('persists hashed, expiring, revocable grants without raw token storage', () => {
    const migration = readFileSync('db/migrations/0009_revision_share_grants.sql', 'utf8');
    expect(migration).toContain('token_digest text not null unique');
    expect(migration).toContain("status in ('active', 'revoked')");
    expect(migration).toContain('expires_at timestamptz not null');
    expect(migration).toContain('base_release_id uuid not null references production_releases');
    expect(migration).not.toMatch(/token\s+text/i);
  });

  it('routes redemption, shared readers, and package reads without putting tokens in asset URLs', () => {
    const vercel = readFileSync('vercel.json', 'utf8');
    const reader = readFileSync('src/reader/main.ts', 'utf8');
    const editor = readFileSync('src/authoring/client/editor.ts', 'utf8');
    expect(vercel).toContain('"/share"');
    expect(vercel).toContain('/s/:id/shared/:grant');
    expect(reader).toContain('/api/shared-stories/${id}/${shared[2]}/package/');
    expect(reader).toContain("fetch('/api/shares/redeem'");
    expect(reader).toContain("history.replaceState(null, '', '/share')");
    expect(reader).not.toContain('/api/shared-stories/${id}/${token}');
    expect(editor).toContain('Create 30-minute share link');
    expect(editor).toContain("method: 'DELETE'");
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

const token = 'a'.repeat(43);
const grant = {
  id: '11111111-1111-4111-8111-111111111111',
  storyId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333',
  revisionId: '44444444-4444-4444-8444-444444444444',
  baseReleaseId: '55555555-5555-4555-8555-555555555555',
  expiresAt: '2026-01-01T00:30:00.000Z',
};

vi.mock('../src/sharing/service', () => ({
  redeemRevisionShare: vi.fn(async (supplied: string) => {
    if (supplied !== token) throw new Error('unexpected token');
    return grant;
  }),
  shareCookie: vi.fn(() => 'scrolltastic_share=opaque; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1800'),
  clearShareCookie: vi.fn(() => 'scrolltastic_share=; Max-Age=0'),
  ShareGrantError: class ShareGrantError extends Error {},
}));

import { POST } from '../server-api/shares/redeem';

afterEach(() => vi.unstubAllEnvs());

describe('share redemption route', () => {
  it('exchanges a fragment-delivered token for a cookie and returns only a clean reader URL', async () => {
    vi.stubEnv('SCROLLTASTIC_APP_ORIGIN', 'https://scrolltastic.test');
    const response = await POST(new Request('https://scrolltastic.test/api/shares/redeem', {
      method: 'POST',
      headers: { origin: 'https://scrolltastic.test', 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    const body = await response.json() as { readerUrl: string };
    expect(body.readerUrl).toBe(`/s/${grant.storyId}/shared/${grant.id}`);
    expect(JSON.stringify(body)).not.toContain(token);
  });

  it('rejects cross-origin token redemption', async () => {
    vi.stubEnv('SCROLLTASTIC_APP_ORIGIN', 'https://scrolltastic.test');
    const response = await POST(new Request('https://scrolltastic.test/api/shares/redeem', {
      method: 'POST',
      headers: { origin: 'https://evil.test', 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }));
    expect(response.status).toBe(403);
  });
});

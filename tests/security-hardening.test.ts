import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AuthoringError, parseJsonRequest } from '../server-api/authoring/_shared';

describe('deployment security baseline', () => {
  const configuration = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { headers: { key: string; value: string }[] }[] };
  const headers = new Map(configuration.headers[0].headers.map(header => [header.key.toLowerCase(), header.value]));

  it('prevents framing, sniffing, referrer leakage and unnecessary device capabilities', () => {
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('referrer-policy')).toBe('no-referrer');
    expect(headers.get('permissions-policy')).toContain('camera=()');
    expect(headers.get('strict-transport-security')).toContain('includeSubDomains');
  });

  it('ships a script-restrictive CSP with no object or framing authority', () => {
    const policy = headers.get('content-security-policy') ?? '';
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("base-uri 'none'");
  });

  it('rejects missing media types, malformed JSON, declared oversize, and actual oversize', async () => {
    await expect(parseJsonRequest(new Request('https://scrolltastic.test', { method: 'POST', body: '{}' }), 10)).rejects.toMatchObject({ status: 415, code: 'unsupported_media_type' } satisfies Partial<AuthoringError>);
    await expect(parseJsonRequest(new Request('https://scrolltastic.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }), 10)).rejects.toMatchObject({ status: 400, code: 'invalid_json' } satisfies Partial<AuthoringError>);
    await expect(parseJsonRequest(new Request('https://scrolltastic.test', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '100' }, body: '{}' }), 10)).rejects.toMatchObject({ status: 413, code: 'request_too_large' } satisfies Partial<AuthoringError>);
    await expect(parseJsonRequest(new Request('https://scrolltastic.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 'long' }) }), 10)).rejects.toMatchObject({ status: 413, code: 'request_too_large' } satisfies Partial<AuthoringError>);
  });
});

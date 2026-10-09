interface UnsignedNostrEvent { kind: number; created_at: number; content: string; tags: string[][] }
interface SignedNostrEvent extends UnsignedNostrEvent { id: string; pubkey: string; sig: string }

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: UnsignedNostrEvent): Promise<SignedNostrEvent>;
    };
  }
}

interface Challenge {
  id: string; challenge: string; expiresAt: string; createdAt: number; loginUrl: string;
}

async function json<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined;
    throw new Error(body?.error?.message ?? 'Nostr authentication failed.');
  }
  return response.json() as Promise<T>;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function signInWithNostr(returnPath = location.pathname): Promise<void> {
  if (!window.nostr) throw new Error('Install or enable a NIP-07 Nostr signer to continue.');
  const publicKey = await window.nostr.getPublicKey();
  if (!/^[0-9a-f]{64}$/.test(publicKey)) throw new Error('The Nostr signer returned an invalid public key.');
  const { challenge } = await json<{ challenge: Challenge }>('/api/auth/nostr/challenge', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnPath }),
  });
  if (Date.parse(challenge.expiresAt) <= Date.now()) throw new Error('The Nostr login challenge expired before it could be signed.');
  const proof = { challengeId: challenge.id, challenge: challenge.challenge };
  const payload = await sha256Hex(JSON.stringify(proof));
  const event = await window.nostr.signEvent({
    kind: 27235, created_at: challenge.createdAt, content: '',
    tags: [['u', challenge.loginUrl], ['method', 'POST'], ['challenge', challenge.challenge], ['payload', payload]],
  });
  if (event.pubkey !== publicKey) throw new Error('The Nostr signer changed identity during login.');
  const result = await json<{ authenticated: true; returnPath: string }>('/api/auth/nostr/session', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proof, event }),
  });
  location.assign(result.returnPath);
}

export async function signOut(): Promise<void> {
  const response = await fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin' });
  if (!response.ok) throw new Error('Sign out failed.');
  location.reload();
}

import type { Principal } from './model.js';
import { readSessionCookie, SessionError, verifySessionToken } from './session.js';

export class AuthenticationError extends Error {
  constructor(public status: 401 | 503, message: string) { super(message); }
}

export async function authenticateGitHubBearer(request: Request, fetcher: typeof fetch = fetch): Promise<Principal | undefined> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return undefined;
  const response = await fetcher('https://api.github.com/user', {
    headers: { authorization, accept: 'application/vnd.github+json', 'user-agent': 'scrolltastic-authoring' },
  });
  if (!response.ok) throw new AuthenticationError(401, 'Your GitHub session is no longer valid.');
  const value: unknown = await response.json();
  const login = value && typeof value === 'object' && 'login' in value && typeof value.login === 'string'
    ? value.login.toLowerCase()
    : '';
  if (!login) throw new AuthenticationError(401, 'Your GitHub identity is unavailable.');
  return { provider: 'github', subject: login, displayName: login };
}

export async function authenticateRequest(request: Request, fetcher: typeof fetch = fetch): Promise<Principal | undefined> {
  const token = readSessionCookie(request);
  if (token) {
    try { return verifySessionToken(token); }
    catch (error) {
      if (error instanceof SessionError && error.message.includes('unavailable')) throw new AuthenticationError(503, error.message);
      throw new AuthenticationError(401, 'Your browser session is invalid or expired.');
    }
  }
  return authenticateGitHubBearer(request, fetcher);
}

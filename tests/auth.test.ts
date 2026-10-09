import { afterEach, describe, expect, it, vi } from 'vitest';
import { storyCapabilities } from '../src/authoring/capabilities';
import { authenticateRequest } from '../src/auth/identity';
import type { Principal, StoryRole } from '../src/auth/model';
import { canStory, storyAuthorization, type StoryMembershipRepository } from '../src/auth/policy';
import { requireTrustedMutationOrigin } from '../src/auth/request-security';
import { createSessionToken, sessionCookie, verifySessionToken } from '../src/auth/session';
import { authoringRolloutDecision, filterActionsForRollout } from '../src/auth/rollout';

const secret = 'a-test-session-secret-that-is-at-least-thirty-two-characters';
const storyId = '550e8400-e29b-41d4-a716-446655440000';
const principal: Principal & { accountId: string } = {
  accountId: '11111111-1111-4111-8111-111111111111', provider: 'oidc', subject: 'person-1', displayName: 'Editor',
};

class Memberships implements StoryMembershipRepository {
  constructor(private readonly role?: StoryRole) {}
  async findRole(): Promise<StoryRole | undefined> { return this.role; }
}

afterEach(() => vi.unstubAllEnvs());

describe('browser sessions', () => {
  it('signs, verifies and expires opaque HttpOnly session cookies', async () => {
    const token = createSessionToken(principal, { now: 1_000, maxAgeMs: 5_000, secret });
    expect(verifySessionToken(token, { now: 2_000, secret })).toEqual(principal);
    expect(() => verifySessionToken(token, { now: 6_000, secret })).toThrow('expired');
    const [payload, signature] = token.split('.');
    const tampered = `${payload}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
    expect(() => verifySessionToken(tampered, { now: 2_000, secret })).toThrow('invalid');
    expect(sessionCookie(token)).toContain('HttpOnly; Secure; SameSite=Lax');

    vi.stubEnv('SCROLLTASTIC_SESSION_SECRET', secret);
    const liveToken = createSessionToken(principal, { secret });
    const request = new Request('https://scrolltastic.test/api/example', { headers: { cookie: sessionCookie(liveToken) } });
    await expect(authenticateRequest(request)).resolves.toEqual(principal);
  });

  it('validates state-changing requests against one configured origin', () => {
    const request = new Request('https://scrolltastic.test/api/example', { method: 'POST', headers: { origin: 'https://scrolltastic.test' } });
    expect(() => requireTrustedMutationOrigin(request, 'https://scrolltastic.test')).not.toThrow();
    expect(() => requireTrustedMutationOrigin(request, 'https://other.test')).toThrow('not allowed');
  });
});

describe('story authorization', () => {
  it.each<[StoryRole, boolean, boolean, boolean]>([
    ['viewer', false, false, false],
    ['editor', true, false, false],
    ['publisher', true, true, false],
    ['owner', true, true, true],
  ])('maps %s to its exact actions', async (role, edit, publish, members) => {
    const repository = new Memberships(role);
    await expect(canStory(repository, storyId, principal, 'story:edit')).resolves.toBe(edit);
    await expect(canStory(repository, storyId, principal, 'story:publish')).resolves.toBe(publish);
    await expect(canStory(repository, storyId, principal, 'story:members-manage')).resolves.toBe(members);
  });

  it('preserves the GitHub allow-list only for legacy publishing', async () => {
    vi.stubEnv('SCROLLTASTIC_PUBLISHERS', 'legacy-author');
    const github = { provider: 'github', subject: 'legacy-author' };
    await expect(canStory(new Memberships(), storyId, github, 'story:publish')).resolves.toBe(true);
    await expect(canStory(new Memberships(), storyId, github, 'story:edit')).resolves.toBe(false);
  });

  it('reports editing and AI prompting as independent capabilities', async () => {
    const authorization = await storyAuthorization(new Memberships('editor'), storyId, principal);
    expect(storyCapabilities({ authoring: { ai: { enabled: true } } }, authorization)).toMatchObject({
      authoring: { canEdit: true, ai: { declared: true, canPrompt: true } }, actions: expect.arrayContaining(['story:edit', 'story:prompt-ai']),
    });
    expect(storyCapabilities({}, authorization)).toEqual({
      authoring: { canEdit: false, ai: { declared: false, canPrompt: false } },
      actions: ['story:read-draft', 'story:memory-propose'],
    });
    expect(storyCapabilities({ authoring: { ai: { enabled: true } } }, await storyAuthorization(new Memberships('viewer'), storyId, principal))).toMatchObject({
      authoring: { canEdit: false, ai: { canPrompt: false } },
    });
  });
});

describe('controlled authoring rollout', () => {
  const subject = { accountId: principal.accountId, storyId, organizationId: '22222222-2222-4222-8222-222222222222' };

  it('supports independent fail-safe kill switches for AI, uploads, commits, and all authoring', () => {
    expect(authoringRolloutDecision('story:prompt-ai', subject, { SCROLLTASTIC_KILL_AI: 'true' })).toMatchObject({ allowed: false, code: 'ai_disabled' });
    expect(authoringRolloutDecision('story:upload', subject, { SCROLLTASTIC_KILL_UPLOADS: 'true' })).toMatchObject({ allowed: false, code: 'uploads_disabled' });
    expect(authoringRolloutDecision('story:publish', subject, { SCROLLTASTIC_KILL_COMMITS: 'true' })).toMatchObject({ allowed: false, code: 'commits_disabled' });
    expect(authoringRolloutDecision('story:read-draft', subject, { SCROLLTASTIC_KILL_AUTHORING: 'true' })).toMatchObject({ allowed: false, code: 'authoring_disabled' });
  });

  it('requires every configured account, story, and organization eligibility dimension', () => {
    const environment = {
      SCROLLTASTIC_AUTHORING_ACCOUNT_IDS: principal.accountId,
      SCROLLTASTIC_AUTHORING_STORY_IDS: storyId,
      SCROLLTASTIC_AUTHORING_ORGANIZATION_IDS: subject.organizationId,
    };
    expect(authoringRolloutDecision('story:edit', subject, environment)).toEqual({ allowed: true });
    expect(authoringRolloutDecision('story:edit', { ...subject, accountId: 'other' }, environment)).toMatchObject({ allowed: false, code: 'not_eligible' });
    expect(filterActionsForRollout(['story:edit', 'story:prompt-ai', 'story:upload', 'story:publish'], subject, { ...environment, SCROLLTASTIC_KILL_AI: 'true' }))
      .toEqual(['story:edit', 'story:upload', 'story:publish']);
  });

  it('keeps editing available when the AI kill switch disables prompting', async () => {
    const authorization = await storyAuthorization(new Memberships('editor'), storyId, principal);
    const environment = {
      SCROLLTASTIC_AUTHORING_ACCOUNT_IDS: principal.accountId,
      SCROLLTASTIC_AUTHORING_STORY_IDS: storyId,
      SCROLLTASTIC_AUTHORING_ORGANIZATION_IDS: subject.organizationId,
      SCROLLTASTIC_KILL_AI: 'true',
    };
    const rolledOut = {
      ...authorization,
      actions: filterActionsForRollout(authorization.actions, subject, environment),
    };

    expect(storyCapabilities({ authoring: { ai: { enabled: true } } }, rolledOut)).toMatchObject({
      authoring: { canEdit: true, ai: { declared: true, canPrompt: false } },
      actions: expect.arrayContaining(['story:edit']),
    });
  });
});

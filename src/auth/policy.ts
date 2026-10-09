import type { Principal, StoryAction, StoryRole } from './model.js';
import { actionsForRole, roleAllows } from './model.js';

export interface StoryMembershipRepository {
  findRole(storyId: string, principal: Principal): Promise<StoryRole | undefined>;
}

export interface StoryAuthorization {
  role?: StoryRole;
  actions: readonly StoryAction[];
}

function legacyPublishAllowed(principal: Principal, action: StoryAction): boolean {
  if (action !== 'story:publish' || principal.provider !== 'github') return false;
  const allowed = new Set((process.env.SCROLLTASTIC_PUBLISHERS ?? '')
    .split(',').map(item => item.trim().toLowerCase()).filter(Boolean));
  return allowed.has(principal.subject.toLowerCase());
}

export async function storyAuthorization(
  repository: StoryMembershipRepository,
  storyId: string,
  principal: Principal,
): Promise<StoryAuthorization> {
  const role = await repository.findRole(storyId, principal);
  const actions = role ? [...actionsForRole(role)] : [];
  if (legacyPublishAllowed(principal, 'story:publish') && !actions.includes('story:publish')) actions.push('story:publish');
  return { role, actions };
}

export async function canStory(
  repository: StoryMembershipRepository,
  storyId: string,
  principal: Principal,
  action: StoryAction,
): Promise<boolean> {
  const role = await repository.findRole(storyId, principal);
  return (role ? roleAllows(role, action) : false) || legacyPublishAllowed(principal, action);
}

import type { NormalizedStory } from '../model/normalized.js';
import type { StoryAction } from '../auth/model.js';
import type { StoryAuthorization } from '../auth/policy.js';

const AUTHORING_ACTIONS = new Set<StoryAction>(['story:edit', 'story:prompt-ai', 'story:upload']);

export interface StoryCapabilities {
  authoring: {
    canEdit: boolean;
    ai: { declared: boolean; canPrompt: boolean };
  };
  actions: readonly StoryAction[];
}

export function storyCapabilities(
  document: Pick<NormalizedStory, 'authoring'>,
  authorization: StoryAuthorization,
): StoryCapabilities {
  const declared = document.authoring?.ai.enabled === true;
  const canEdit = declared && authorization.actions.includes('story:edit');
  const canPrompt = declared && authorization.actions.includes('story:prompt-ai');
  return {
    authoring: { canEdit, ai: { declared, canPrompt } },
    actions: declared
      ? authorization.actions
      : authorization.actions.filter(action => !AUTHORING_ACTIONS.has(action)),
  };
}

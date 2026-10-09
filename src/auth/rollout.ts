import type { StoryAction } from './model.js';

export interface RolloutSubject { accountId: string; storyId: string; organizationId?: string }
export interface RolloutDecision { allowed: boolean; code?: 'authoring_disabled' | 'ai_disabled' | 'uploads_disabled' | 'commits_disabled' | 'not_eligible' }

type RolloutEnvironment = Record<string, string | undefined>;

function enabled(environment: RolloutEnvironment, name: string): boolean {
  return environment[name]?.trim().toLowerCase() !== 'true';
}

function allowlisted(environment: RolloutEnvironment, name: string, value: string | undefined): boolean {
  const configured = (environment[name] ?? '').split(',').map(item => item.trim()).filter(Boolean);
  return !configured.length || Boolean(value && configured.includes(value));
}

export function authoringRolloutDecision(
  action: StoryAction,
  subject: RolloutSubject,
  environment: RolloutEnvironment = process.env,
): RolloutDecision {
  if (!enabled(environment, 'SCROLLTASTIC_KILL_AUTHORING')) return { allowed: false, code: 'authoring_disabled' };
  if (!allowlisted(environment, 'SCROLLTASTIC_AUTHORING_ACCOUNT_IDS', subject.accountId)
    || !allowlisted(environment, 'SCROLLTASTIC_AUTHORING_STORY_IDS', subject.storyId)
    || !allowlisted(environment, 'SCROLLTASTIC_AUTHORING_ORGANIZATION_IDS', subject.organizationId)) {
    return { allowed: false, code: 'not_eligible' };
  }
  if (action === 'story:prompt-ai' && !enabled(environment, 'SCROLLTASTIC_KILL_AI')) return { allowed: false, code: 'ai_disabled' };
  if (action === 'story:upload' && !enabled(environment, 'SCROLLTASTIC_KILL_UPLOADS')) return { allowed: false, code: 'uploads_disabled' };
  if (action === 'story:publish' && !enabled(environment, 'SCROLLTASTIC_KILL_COMMITS')) return { allowed: false, code: 'commits_disabled' };
  return { allowed: true };
}

export function filterActionsForRollout(actions: readonly StoryAction[], subject: RolloutSubject, environment: RolloutEnvironment = process.env): StoryAction[] {
  return actions.filter(action => authoringRolloutDecision(action, subject, environment).allowed);
}

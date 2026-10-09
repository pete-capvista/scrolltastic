export type StoryRole = 'viewer' | 'editor' | 'publisher' | 'owner';

export type StoryAction =
  | 'story:read-draft'
  | 'story:edit'
  | 'story:prompt-ai'
  | 'story:upload'
  | 'story:publish'
  | 'story:memory-propose'
  | 'story:memory-approve'
  | 'story:members-manage';

export interface Principal {
  accountId?: string;
  provider: string;
  subject: string;
  displayName?: string;
}

const ROLE_ACTIONS: Record<StoryRole, readonly StoryAction[]> = {
  viewer: ['story:read-draft'],
  editor: ['story:read-draft', 'story:edit', 'story:prompt-ai', 'story:upload', 'story:memory-propose'],
  publisher: ['story:read-draft', 'story:edit', 'story:prompt-ai', 'story:upload', 'story:publish', 'story:memory-propose', 'story:memory-approve'],
  owner: ['story:read-draft', 'story:edit', 'story:prompt-ai', 'story:upload', 'story:publish', 'story:memory-propose', 'story:memory-approve', 'story:members-manage'],
};

export function actionsForRole(role: StoryRole): readonly StoryAction[] {
  return ROLE_ACTIONS[role];
}

export function roleAllows(role: StoryRole, action: StoryAction): boolean {
  return ROLE_ACTIONS[role].includes(action);
}

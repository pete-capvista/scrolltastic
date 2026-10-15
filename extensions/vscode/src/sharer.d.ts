export interface StoryIdentity {
  id: string;
  title: string;
}

export interface ShareResult {
  id: string;
  url: string;
  expiresAt: string;
}

export function storyIdentity(document: unknown): StoryIdentity;
export function createShareLink(vscode: unknown, document: unknown, apiBase: string): Promise<ShareResult | undefined>;

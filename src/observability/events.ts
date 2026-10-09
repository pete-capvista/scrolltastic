export type OperationalEvent = {
  event: string;
  outcome: 'started' | 'completed' | 'failed' | 'skipped';
  requestId?: string;
  storyId?: string;
  workspaceId?: string;
  generationId?: string;
  durationMs?: number;
  count?: number;
  errorCode?: string;
  providerStatus?: number;
  providerCode?: string;
  providerType?: string;
  providerRequestId?: string;
};

export function logOperationalEvent(event: OperationalEvent): void {
  const record = { timestamp: new Date().toISOString(), service: 'scrolltastic-authoring', ...event };
  const line = JSON.stringify(record);
  if (event.outcome === 'failed') console.error(line);
  else console.info(line);
}

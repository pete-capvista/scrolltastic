export const MEMORY_CATEGORIES = ['canon', 'style', 'arc', 'derived'] as const;
export type MemoryCategory = typeof MEMORY_CATEGORIES[number];
export type MemoryStatus = 'proposed' | 'approved' | 'rejected' | 'invalidated';

export interface StoryMemoryRecord {
  id: string;
  storyId: string;
  category: MemoryCategory;
  value: unknown;
  provenance: { evidence: string; reason: string; generationId?: string };
  confidence: number;
  status: MemoryStatus;
  scope: string[];
  sourceRevisionId?: string;
  derived: boolean;
  createdBy: string;
  reviewedBy?: string;
  createdAt: string;
  reviewedAt?: string;
  invalidatedAt?: string;
  updatedAt: string;
}

export interface MemoryProposalInput {
  category: MemoryCategory;
  value: unknown;
  evidence: string;
  reason: string;
  confidence: number;
  scope?: string[];
  derived?: boolean;
}

export interface SuppliedMemory {
  id: string;
  category: MemoryCategory;
  value: unknown;
  confidence: number;
  scope: string[];
}

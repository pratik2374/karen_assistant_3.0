export enum MemoryTier {
  WORKING_MEMORY = 0,    // Critical immediate context (e.g. current task, active constraints)
  ACTIVE_TASK = 1,       // Data related to the currently focused aggregate
  RECENT_EPISODIC = 2,   // Short-term conversational history / recent events
  SEMANTIC = 3,          // Long-term facts, rules, learned preferences
  BEHAVIORAL = 4,        // Personality traits, tone guardrails
  ARCHIVED = 5           // Highly compressed long-term historical data
}

export interface IMemoryBlock {
  memoryId: string;
  tier: MemoryTier;
  content: string;
  tags: string[];
  createdAt: Date;
  expiresAt?: Date;
  relevanceScore: number; // Evaluated dynamically during retrieval
}

export enum ContextAssemblyMode {
  FAST = 'FAST',                   // Low latency, minimal context
  REFLECTION = 'REFLECTION',       // Deep context, high token budget
  PLANNING = 'PLANNING',           // Standard task context
  MEMORY_RECALL = 'MEMORY_RECALL', // Heavy on semantic/archived
  SUMMARIZATION = 'SUMMARIZATION'  // Heavy on episodic
}

export interface AssemblyModeConfig {
  maxTokens: number;
  allowedTiers: number[]; // e.g. [0, 1, 2]
}

export const ModeConfigs: Record<ContextAssemblyMode, AssemblyModeConfig> = {
  [ContextAssemblyMode.FAST]: { maxTokens: 1000, allowedTiers: [0, 1] },
  [ContextAssemblyMode.PLANNING]: { maxTokens: 4000, allowedTiers: [0, 1, 2, 3] },
  [ContextAssemblyMode.REFLECTION]: { maxTokens: 8000, allowedTiers: [0, 1, 2, 3, 4] },
  [ContextAssemblyMode.MEMORY_RECALL]: { maxTokens: 6000, allowedTiers: [0, 2, 3, 4, 5] },
  [ContextAssemblyMode.SUMMARIZATION]: { maxTokens: 8000, allowedTiers: [2, 5] },
};

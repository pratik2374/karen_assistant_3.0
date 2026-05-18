export interface ContextProvenance {
  sourceMemoryIds: string[];
  retrievalReason: string;
  rankingScore: number;
  isSanitized: boolean;
  isTruncated: boolean;
  compressionLineage?: string[];
}

export interface AssembledContextBlock {
  tierName: string;
  content: string;
  provenance: ContextProvenance;
  tokenCount: number;
}

export interface AssembledContext {
  blocks: AssembledContextBlock[];
  totalTokens: number;
  budgetUtilized: number;
  assemblyMode: string;
}

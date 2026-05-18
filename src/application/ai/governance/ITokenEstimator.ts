export interface ITokenEstimator {
  estimateTokens(text: string): number;
  truncateToFit(text: string, maxTokens: number): string;
}

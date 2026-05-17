import { ISecurityInspectionPipeline, PromptSanitizationPolicy } from '../security/ISecurityInspectionPipeline';
import { AIResponseValidator } from '../validation/AIResponseValidator';
import { AIProposal } from '../../../application/commands/CommandStandard';
import { AITokenBudgetPolicy } from '../../../application/policies/ApplicationPolicies';
import { HumanOverridePolicy } from '../../security/HumanOverridePolicy';

export enum AILatencyTier {
  FAST = 'FAST', // e.g., gpt-4o-mini
  SLOW = 'SLOW'  // e.g., gpt-4o
}

export class OpenAIAdapter {
  constructor(
    private securityPipeline: ISecurityInspectionPipeline,
    private validator: AIResponseValidator,
    private budgetPolicy: AITokenBudgetPolicy
  ) {}

  public async generateProposal(
    rawContext: string,
    tier: AILatencyTier,
    sanitizationPolicy: PromptSanitizationPolicy
  ): Promise<AIProposal> {
    
    if (HumanOverridePolicy.isAiDisabled()) {
      throw new Error('AI execution blocked by HumanOverridePolicy');
    }

    // 1. Budget Enforcement
    const estimatedTokens = rawContext.length / 4; // naive estimation
    if (!this.budgetPolicy.canExecuteCommand(estimatedTokens)) {
      throw new Error('AI Token Budget Exceeded. Degraded mode active.');
    }

    // 2. Security Sanitization (PII, Links, XML escaping)
    const sanitizedContext = await this.securityPipeline.inspectInput(rawContext, sanitizationPolicy);

    // 3. Simulated API Call (Infrastructure Adapter)
    // Here we would call the actual OpenAI SDK using the selected tier.
    const model = tier === AILatencyTier.FAST ? 'gpt-4o-mini' : 'gpt-4o';
    console.log(`Executing ${model} with sanitized payload length: ${sanitizedContext.cleanPayload.length}`);
    
    this.budgetPolicy.consumeTokens(estimatedTokens);
    
    // Simulating a valid JSON return from OpenAI for compilation
    const mockRawOutput = JSON.stringify({
      proposalId: '123e4567-e89b-12d3-a456-426614174000',
      actionIntent: 'SCHEDULE_REMINDER',
      reasoning: 'User explicitly requested a reminder for tomorrow',
      rawPayload: { time: 'tomorrow' },
      confidence: 0.95,
      proposedAt: new Date().toISOString(),
      traceId: '123e4567-e89b-12d3-a456-426614174000'
    });

    // 4. Output Validation & Schema Mapping
    return this.validator.validate(mockRawOutput);
  }
}

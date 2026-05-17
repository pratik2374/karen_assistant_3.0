export interface SanitizedContext {
  cleanPayload: string;
  redactedKeys: string[];
}

export interface PromptSanitizationPolicy {
  shouldRedactEmails: boolean;
  shouldRedactUrls: boolean;
  shouldEnforceXmlBoundaries: boolean;
  maxLength: number;
}

export interface ISecurityInspectionPipeline {
  inspectInput(rawInput: string, policy: PromptSanitizationPolicy): Promise<SanitizedContext>;
  validateOutput(rawOutput: string): Promise<boolean>;
}

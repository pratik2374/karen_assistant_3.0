import { ISecurityInspectionPipeline, PromptSanitizationPolicy, SanitizedContext } from './ISecurityInspectionPipeline';

export class DeterministicContextSanitizer implements ISecurityInspectionPipeline {
  
  async inspectInput(rawInput: string, policy: PromptSanitizationPolicy): Promise<SanitizedContext> {
    let cleanPayload = rawInput;
    const redactedKeys: string[] = [];

    if (cleanPayload.length > policy.maxLength) {
      cleanPayload = cleanPayload.substring(0, policy.maxLength) + '...[TRUNCATED]';
    }

    if (policy.shouldRedactEmails) {
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
      cleanPayload = cleanPayload.replace(emailRegex, '[REDACTED_EMAIL]');
      redactedKeys.push('email');
    }

    if (policy.shouldRedactUrls) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      cleanPayload = cleanPayload.replace(urlRegex, '[REDACTED_URL]');
      redactedKeys.push('url');
    }

    if (policy.shouldEnforceXmlBoundaries) {
      // Prevent XML injection by escaping rogue tags in user input before placing in prompt XML
      cleanPayload = cleanPayload.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    return {
      cleanPayload,
      redactedKeys
    };
  }

  async validateOutput(rawOutput: string): Promise<boolean> {
    // Basic deterministic structural check before full schema validation
    return rawOutput.includes('{') && rawOutput.includes('}');
  }
}

export interface PromptSanitizationPolicy {
  maxLength: number;
  shouldRedactEmails: boolean;
  shouldRedactUrls: boolean;
  shouldEnforceXmlBoundaries: boolean;
  shouldRedactSecrets?: boolean;
}

export interface SanitizedContext {
  cleanPayload: string;
  redactedKeys: string[];
}

export interface ISecurityInspectionPipeline {
  inspectInput(rawInput: string, policy: PromptSanitizationPolicy): Promise<SanitizedContext>;
  validateOutput(rawOutput: string): Promise<boolean>;
}
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

    if (policy.shouldRedactSecrets !== false) { // Default to true if undefined
      const secretRegex = /(sk-[a-zA-Z0-9]{20,}|xox[baprs]-[a-zA-Z0-9]{10,})/g;
      if (secretRegex.test(cleanPayload)) {
        cleanPayload = cleanPayload.replace(secretRegex, '[REDACTED_SECRET]');
        redactedKeys.push('secret');
      }
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

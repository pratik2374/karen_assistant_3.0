export interface HumanOverrideState {
  proactiveModePaused: boolean;
  integrationsDisabled: boolean;
  aiProposalsDisabled: boolean;
  escalationPaused: boolean;
  lastUpdatedBy: string;
  lastUpdatedAt: Date;
}

export class HumanOverridePolicy {
  private static state: HumanOverrideState = {
    proactiveModePaused: false,
    integrationsDisabled: false,
    aiProposalsDisabled: false,
    escalationPaused: false,
    lastUpdatedBy: 'system',
    lastUpdatedAt: new Date()
  };

  public static isIntegrationDisabled(): boolean {
    return this.state.integrationsDisabled;
  }

  public static isProactiveModePaused(): boolean {
    return this.state.proactiveModePaused;
  }

  public static isAiDisabled(): boolean {
    return this.state.aiProposalsDisabled;
  }

  public static updateState(newState: Partial<HumanOverrideState>, userId: string): void {
    this.state = {
      ...this.state,
      ...newState,
      lastUpdatedBy: userId,
      lastUpdatedAt: new Date()
    };
  }
}

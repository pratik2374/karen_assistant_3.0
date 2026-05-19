// ─────────────────────────────────────────────────────────────────────────────
// IAgent — Core contract for all internal domain worker agents.
//
// GOVERNANCE RULES:
//  - Agents are SILENT internal workers. They NEVER communicate with users.
//  - All results flow upward through Karen's MessageRenderer for rendering.
//  - Agents execute ONLY through ToolExecutionGateway.
//  - Agents are stateless except via repositories.
//  - All agents must be replay-safe and observable.
// ─────────────────────────────────────────────────────────────────────────────

export interface IAgent {
  /** Unique identifier for observability and routing. */
  readonly name: string;
  /** Domain this agent coordinates (e.g. 'calendar', 'reminder', 'messaging'). */
  readonly domain: string;
  /** Capabilities this agent declares to the AgentCapabilityRegistry. */
  readonly capabilities: string[];

  /** Primary execution entry point. NEVER writes directly to user output. */
  execute(context: AgentContext): Promise<AgentExecutionResult>;
}

export interface AgentContext {
  /** The resolved intent string from the AI Proposal (e.g. 'list_tasks', 'create_calendar_event'). */
  intent: string;
  /** Structured payload extracted from the AI proposal's rawPayload / toolArguments. */
  payload: Record<string, any>;
  /** User identifier (WhatsApp phone number or internal ID). */
  userId: string;
  /** Trace ID for distributed observability. */
  traceId: string;
  /** Correlation ID for causation chain. */
  correlationId: string;
  /** If true, all side-effectful operations must be suppressed (replay safety). */
  isReplay: boolean;
  /** If true, all external calls route to mock/sandbox implementations. */
  isSandbox: boolean;
}

export interface AgentExecutionResult {
  status: 'SUCCESS' | 'FAILED' | 'NEEDS_CLARIFICATION';
  /**
   * Structured result data for Karen to consume.
   * Karen's MessageRenderer reads this and generates user-facing response.
   * Agents never produce WhatsApp-formatted text directly.
   */
  data: Record<string, any>;
  /**
   * Human-readable report. Karen may use this verbatim in the WhatsApp response,
   * or enrich it with her personality layer.
   */
  summaryReport: string;
  mutationsCount: number;
  latencyMs: number;
  errorCode?: string;
}

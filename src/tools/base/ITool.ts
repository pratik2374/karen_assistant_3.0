// ─────────────────────────────────────────────────────────────────────────────
// ITool — Core contract for all external integration boundary tools.
//
// GOVERNANCE RULES:
//  - Tools are the ONLY permitted external API boundary in the system.
//  - All Tool executions MUST pass through ToolExecutionGateway.
//  - Tools support replay suppression, sandbox mode, circuit breaking.
//  - Tools upsert shadow projections after every successful mutation.
//  - Composio is the underlying transport for all calendar/mail tools.
// ─────────────────────────────────────────────────────────────────────────────

export interface ITool<TInput = Record<string, any>, TOutput = Record<string, any>> {
  /** Tool name for observability (e.g. 'CalendarTool'). */
  readonly name: string;
  /** The specific capability being exercised (e.g. 'GOOGLECALENDAR_LIST_EVENTS'). */
  readonly capability: string;
}

export interface ToolInput {
  userId: string;
  payload: Record<string, any>;
  traceId: string;
  correlationId: string;
  isReplay: boolean;
  isSandbox: boolean;
  idempotencyKey: string;
}

export interface ToolResult<T = Record<string, any>> {
  success: boolean;
  data?: T;
  error?: string;
  isRetryable?: boolean;
  externalEventId?: string;   // e.g. Google Calendar event ID after creation
  etag?: string;              // For optimistic concurrency on updates
  latencyMs?: number;
}

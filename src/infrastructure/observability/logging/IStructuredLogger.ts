export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SECURITY';
export type ExecutionMode = 'PRODUCTION' | 'SANDBOX' | 'REPLAY' | 'DRY_RUN';

export interface StructuredLogEntry {
  // Provenance
  traceId: string;
  correlationId: string;
  causationId?: string;

  // Entity Context
  aggregateId?: string;
  aggregateType?: string;
  sagaId?: string;
  queueName?: string;

  // Operation
  level: LogLevel;
  message: string;
  operation?: string;
  schemaVersion: number;
  timestamp: string;

  // Execution Mode — NEVER mix telemetry streams
  executionMode: ExecutionMode;

  // AI-specific fields (optional)
  modelUsed?: string;
  tokenUsage?: number;
  latencyMs?: number;
  confidence?: number;

  // Reliability fields
  retryCount?: number;
  replayed?: boolean;
  replaySafe?: boolean;

  // Arbitrary structured payload
  payload?: Record<string, any>;
}

export interface IStructuredLogger {
  info(message: string, context: Partial<StructuredLogEntry>): void;
  warn(message: string, context: Partial<StructuredLogEntry>): void;
  error(message: string, context: Partial<StructuredLogEntry>): void;
  security(message: string, context: Partial<StructuredLogEntry>): void;
}

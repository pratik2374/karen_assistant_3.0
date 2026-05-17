import { IStructuredLogger, StructuredLogEntry, ExecutionMode, LogLevel } from './IStructuredLogger';

export class ConsoleStructuredLogger implements IStructuredLogger {
  constructor(private defaultMode: ExecutionMode = 'PRODUCTION') {}

  private emit(level: LogLevel, message: string, context: Partial<StructuredLogEntry>): void {
    const entry: StructuredLogEntry = {
      traceId: context.traceId ?? 'untraced',
      correlationId: context.correlationId ?? 'uncorrelated',
      level,
      message,
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      executionMode: context.executionMode ?? this.defaultMode,
      ...context
    };
    console.log(JSON.stringify(entry));
  }

  info(message: string, context: Partial<StructuredLogEntry>): void {
    this.emit('INFO', message, context);
  }

  warn(message: string, context: Partial<StructuredLogEntry>): void {
    this.emit('WARN', message, context);
  }

  error(message: string, context: Partial<StructuredLogEntry>): void {
    this.emit('ERROR', message, context);
  }

  security(message: string, context: Partial<StructuredLogEntry>): void {
    this.emit('SECURITY', message, context);
  }
}

// OpenTelemetry-compatible tracer abstraction.
// This contract allows swapping to a real OTEL SDK without touching business code.

export interface SpanContext {
  traceId: string;
  spanId: string;
  correlationId: string;
  causationId?: string;
}

export interface ISpan {
  spanId: string;
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: 'OK' | 'ERROR', message?: string): void;
  end(): void;
}

export interface ITracer {
  startSpan(operationName: string, parentContext?: SpanContext): ISpan;
  injectContext(span: ISpan): SpanContext;
}

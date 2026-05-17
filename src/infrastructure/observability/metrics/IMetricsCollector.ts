// Prometheus-compatible metrics abstraction.
// In production: wire to prom-client. Here: in-memory counters for MVP.

export interface ICounter {
  increment(labels?: Record<string, string>): void;
}

export interface IGauge {
  set(value: number, labels?: Record<string, string>): void;
}

export interface IHistogram {
  observe(value: number, labels?: Record<string, string>): void;
}

export interface IMetricsCollector {
  // AI
  aiTokensUsed: ICounter;
  aiRequestLatency: IHistogram;
  aiHallucinationRejections: ICounter;
  aiSchemaFailures: ICounter;
  aiFallbackActivations: ICounter;

  // Queue
  queueDepth: IGauge;
  deadLetterGrowth: ICounter;
  duplicateDetections: ICounter;
  consumerLag: IGauge;

  // Circuit Breaker
  circuitBreakerOpenTransitions: ICounter;
  circuitBreakerResets: ICounter;

  // Saga
  sagaCompensations: ICounter;
  sagaTimeouts: ICounter;

  // Security
  permissionDenials: ICounter;
  sanitizationRejections: ICounter;
  replaySuppressions: ICounter;

  // Cost
  aiEstimatedCostUsd: ICounter;
}

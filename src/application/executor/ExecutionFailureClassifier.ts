// -----------------------------------------------------------------------
// Failure Classification — every runtime error maps to a deterministic policy.
// Used by the execution pipeline to decide retry vs dead-letter vs abort.
// -----------------------------------------------------------------------

export enum FailureClass {
  RETRYABLE = 'RETRYABLE',           // Transient infra errors — safe to retry with backoff
  COMPENSATABLE = 'COMPENSATABLE',   // Partial success — saga must compensate
  DEAD_LETTERABLE = 'DEAD_LETTERABLE', // Poison — quarantine, alert, manual review
  FATAL = 'FATAL',                   // Process must halt — invalid config, crypto failure
  DEGRADED_SAFE = 'DEGRADED_SAFE'    // Non-critical path, fail silently, continue
}

export interface ClassifiedFailure {
  class: FailureClass;
  originalError: Error;
  reason: string;
  retryable: boolean;
}

export class ExecutionFailureClassifier {
  static classify(error: unknown): ClassifiedFailure {
    const err = error instanceof Error ? error : new Error(String(error));
    const msg = err.message.toLowerCase();

    if (msg.includes('optimistic concurrency') || msg.includes('duplicate key')) {
      return { class: FailureClass.RETRYABLE, originalError: err, reason: 'Concurrency conflict — safe retry', retryable: true };
    }
    if (msg.includes('domain invariant') || msg.includes('validation')) {
      return { class: FailureClass.DEAD_LETTERABLE, originalError: err, reason: 'Business rule violation', retryable: false };
    }
    if (msg.includes('circuit breaker')) {
      return { class: FailureClass.RETRYABLE, originalError: err, reason: 'Downstream circuit open', retryable: true };
    }
    if (msg.includes('token budget')) {
      return { class: FailureClass.DEGRADED_SAFE, originalError: err, reason: 'AI budget exhausted', retryable: false };
    }
    if (msg.includes('encryption') || msg.includes('crypto')) {
      return { class: FailureClass.FATAL, originalError: err, reason: 'Encryption failure', retryable: false };
    }

    return { class: FailureClass.RETRYABLE, originalError: err, reason: 'Unknown transient error', retryable: true };
  }
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',       // Normal operation
  OPEN = 'OPEN',           // Failing, fast-reject calls
  HALF_OPEN = 'HALF_OPEN'  // Testing recovery
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number | null = null;

  constructor(private options: CircuitBreakerOptions) {}

  public async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      const now = Date.now();
      if (this.lastFailureTime && now - this.lastFailureTime > this.options.resetTimeoutMs) {
        this.state = CircuitBreakerState.HALF_OPEN;
      } else {
        throw new Error('Circuit Breaker is OPEN. Call fast-failed.');
      }
    }

    try {
      const result = await action();
      this.reset();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
    }
  }

  private reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = CircuitBreakerState.CLOSED;
  }
}

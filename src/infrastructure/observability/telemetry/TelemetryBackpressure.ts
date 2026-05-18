export interface BackpressureConfig {
  maxEventsPerSecond: number;
  sampleRateIfThrottled: number; // e.g., 0.1 to log 10% of events when throttled
}

// -----------------------------------------------------------------------
// TelemetryBackpressure — guarantees observability never starves the event
// loop or crashes the process under extreme load (e.g., replay loops).
// -----------------------------------------------------------------------
export class TelemetryBackpressure {
  private eventCount = 0;
  private intervalStart = Date.now();
  
  constructor(private config: BackpressureConfig = { maxEventsPerSecond: 1000, sampleRateIfThrottled: 0.05 }) {}

  // Returns true if the event should be emitted, false if it should be dropped/sampled out
  public shouldEmit(): boolean {
    const now = Date.now();
    
    // Reset window every second
    if (now - this.intervalStart > 1000) {
      this.eventCount = 0;
      this.intervalStart = now;
    }

    this.eventCount++;

    if (this.eventCount <= this.config.maxEventsPerSecond) {
      return true;
    }

    // When throttled, sample based on the configured rate
    return Math.random() < this.config.sampleRateIfThrottled;
  }
}

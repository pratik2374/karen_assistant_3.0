// -----------------------------------------------------------------------
// Seeded PRNG for Deterministic Chaos Reproducibility
// -----------------------------------------------------------------------
export class SeededRandom {
  private seed: number;

  constructor(seedStr: string) {
    this.seed = this.hashString(seedStr);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  // Returns a deterministic float between 0 and 1
  public next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }

  // Returns true if the next random is below probability (0.0 to 1.0)
  public probability(p: number): boolean {
    return this.next() < p;
  }

  public range(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

// -----------------------------------------------------------------------
// ChaosHarness — Utilities to inject deterministic faults
// -----------------------------------------------------------------------
export class ChaosHarness {
  public random: SeededRandom;

  constructor(seed: string = 'deterministic-chaos-seed-v1') {
    this.random = new SeededRandom(seed);
  }

  // Artificial latency simulation
  public async simulateLatency(minMs: number, maxMs: number): Promise<void> {
    const delay = this.random.range(minMs, maxMs);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  // Network partition simulator: throws error with probability P
  public injectNetworkPartition(probability: number, errorMsg: string = 'Simulated Network Partition'): void {
    if (this.random.probability(probability)) {
      throw new Error(errorMsg);
    }
  }

  // Helper to intercept and wrap objects (e.g. MockRepository)
  public createFaultyProxy<T extends object>(target: T, methodNames: (keyof T)[], faultProbability: number): T {
    const handler: ProxyHandler<T> = {
      get: (obj, prop) => {
        if (methodNames.includes(prop as keyof T)) {
          return async (...args: any[]) => {
            this.injectNetworkPartition(faultProbability, `Chaos Proxy Fault on ${String(prop)}`);
            const origMethod = (obj as any)[prop];
            return origMethod.apply(obj, args);
          };
        }
        return (obj as any)[prop];
      }
    };
    return new Proxy(target, handler);
  }
}

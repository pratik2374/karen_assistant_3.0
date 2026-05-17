export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  CRITICAL = 'CRITICAL'
}

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  errorMessage?: string;
  checkedAt: Date;
}

export interface SystemHealthReport {
  overall: HealthStatus;
  components: ComponentHealth[];
  generatedAt: Date;
}

export interface IHealthProbe {
  check(): Promise<ComponentHealth>;
}

export class HealthAggregator {
  constructor(private probes: IHealthProbe[]) {}

  async getSystemHealth(): Promise<SystemHealthReport> {
    const results = await Promise.allSettled(this.probes.map(p => p.check()));

    const components: ComponentHealth[] = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        name: `probe_${i}`,
        status: HealthStatus.CRITICAL,
        errorMessage: String((r as PromiseRejectedResult).reason),
        checkedAt: new Date()
      };
    });

    const hasCritical = components.some(c => c.status === HealthStatus.CRITICAL);
    const hasDegraded = components.some(c => c.status === HealthStatus.DEGRADED);
    const overall = hasCritical
      ? HealthStatus.CRITICAL
      : hasDegraded
        ? HealthStatus.DEGRADED
        : HealthStatus.HEALTHY;

    return { overall, components, generatedAt: new Date() };
  }
}

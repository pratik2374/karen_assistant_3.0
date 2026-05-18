import { CircuitBreaker } from '../../src/infrastructure/resiliency/CircuitBreaker';
import { ChaosHarness } from './harness/ChaosHarness';

describe('Circuit Breaker & Retry Storm Simulation', () => {
  let breaker: CircuitBreaker;
  let harness: ChaosHarness;

  beforeEach(() => {
    breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 100 });
    harness = new ChaosHarness('circuit-breaker-seed');
  });

  it('trips the circuit after consecutive latency timeouts and enters DEGRADED mode', async () => {
    const mockOpenAICall = jest.fn().mockImplementation(async () => {
      // Simulate extreme latency that causes a timeout throw
      await harness.simulateLatency(500, 1000);
      throw new Error('Timeout exceeded');
    });

    const fire = async () => {
      try {
        await breaker.execute(mockOpenAICall);
        return 'success';
      } catch (err: any) {
        return err.message;
      }
    };

    // 1. Fire 3 times, all fail (hitting threshold)
    expect(await fire()).toBe('Timeout exceeded');
    expect(await fire()).toBe('Timeout exceeded');
    expect(await fire()).toBe('Timeout exceeded');

    // 2. 4th time should fail FAST with CircuitBreakerOpenException without calling the mock
    expect(await fire()).toBe('Circuit breaker is open');
    expect(mockOpenAICall).toHaveBeenCalledTimes(3); // Mock was NOT called the 4th time

    // 3. Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // 4. Circuit is HALF_OPEN, next call will hit the mock again
    mockOpenAICall.mockResolvedValueOnce('success');
    expect(await fire()).toBe('success');
    
    // 5. Circuit is now CLOSED
    expect(mockOpenAICall).toHaveBeenCalledTimes(4);
  });
});

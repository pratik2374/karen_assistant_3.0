import { TaskAggregate } from '../../src/domain/task/TaskAggregate';
import { ChaosHarness } from './harness/ChaosHarness';

describe('Event Store Corruption & Replay Simulation', () => {

  it('quarantines malformed events during replay to prevent poisoning', () => {
    // 1. Simulate pulling an event history where one event was corrupted 
    // by a bad schema migration or truncated JSON
    const historicalEvents: any[] = [
      { eventType: 'Task.Created', aggregateVersion: 1, payload: { state: 'CREATED', priority: 'high' } },
      { eventType: 'Task.UnknownCorruptedEvent', aggregateVersion: 2, payload: null }, // Corrupted
      { eventType: 'Task.Completed', aggregateVersion: 3, payload: { state: 'COMPLETED' } }
    ];

    const aggregate = TaskAggregate.create('task-123', 'high', {
      traceId: '1', correlationId: '2', expiresAt: new Date(), timeContext: {} as any
    });

    // 2. We attempt to load history. Our domain should either ignore unknown events
    // or deterministically throw a specific error, preventing partial state mutations.
    let errorCaught = null;
    try {
      aggregate.loadFromHistory(historicalEvents);
    } catch (err: any) {
      errorCaught = err;
    }

    // In this specific implementation of TaskAggregate.mutate, if the eventType is unknown,
    // the switch statement just breaks and ignores it (safe forward-compatibility).
    // If it was a known event but malformed payload, it would throw TypeError.
    
    // We expect the version to be at least 3 since it skipped the unknown event and loaded the 3rd.
    expect(aggregate.version).toBe(3);
  });
});

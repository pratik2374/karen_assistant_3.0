import { ChaosHarness } from './harness/ChaosHarness';
import { MockUnitOfWork, MockOutboxStore, MockRepository } from '../integration/TestDoubles';
import { TaskAggregate } from '../../src/domain/task/TaskAggregate';
import { OutboxDispatcher } from '../../src/infrastructure/messaging/outbox/OutboxDispatcher';

describe('Outbox Crash Recovery & Split-Brain Simulation', () => {
  let outboxStore: MockOutboxStore;
  let harness: ChaosHarness;

  beforeEach(() => {
    outboxStore = new MockOutboxStore();
    harness = new ChaosHarness('crash-recovery-seed');
  });

  it('recovers abandoned messages if a worker dies without locking contention', async () => {
    // 1. Setup outbox with 10 messages
    for (let i = 0; i < 10; i++) {
      await outboxStore.save({
        messageId: `msg-${i}`,
        eventType: 'TestEvent',
        payload: { id: i },
        createdAt: new Date(),
        processedAt: null,
        idempotencyKey: `idem-${i}`,
        deduplicationKey: `dedup-${i}`,
        replaySafe: false,
        sideEffectFree: false,
        traceId: 'trace-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      });
    }

    // 2. Simulate worker 1 pulling messages but crashing BEFORE marking them published
    const mockPublisher = {
      publish: jest.fn().mockImplementation(async () => {
        // Publish succeeds, but we will simulate a crash right after
      })
    };

    // 3. Simulate lock lease expiration
    const mockLockService = {
      acquire: jest.fn().mockResolvedValue({ lock: 'lock-token' }),
      extend: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(true)
    };

    const dispatcher1 = new OutboxDispatcher(outboxStore as any, mockPublisher as any, mockLockService as any);

    // Manually run one batch, but we inject a fault in markAsPublished
    const faultyOutbox = harness.createFaultyProxy(outboxStore, ['markAsPublished'], 1.0); // 100% failure
    const dispatcher2 = new OutboxDispatcher(faultyOutbox as any, mockPublisher as any, mockLockService as any);
    
    // The batch will fail midway through marking as published
    await dispatcher2['dispatchBatch']();

    // 4. Because they weren't marked as published, they are still in the outbox
    const remaining = await outboxStore.getUnpublishedMessages(50);
    expect(remaining.length).toBe(10); // Still 10!

    // 5. Worker 2 boots up (healthy outbox) and successfully dispatches
    const healthyDispatcher = new OutboxDispatcher(outboxStore as any, mockPublisher as any, mockLockService as any);
    await healthyDispatcher['dispatchBatch']();

    const finalRemaining = await outboxStore.getUnpublishedMessages(50);
    expect(finalRemaining.length).toBe(0); // All 10 processed
    
    // Note: mockPublisher.publish was called 20 times (10 in crashed worker, 10 in healthy worker).
    // This is EXACTLY why IdempotentConsumer is required on the queue side. At-least-once delivery.
    expect(mockPublisher.publish).toHaveBeenCalledTimes(20);
  });
});

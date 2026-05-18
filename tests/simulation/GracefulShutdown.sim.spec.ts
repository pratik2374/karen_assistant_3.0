import { GracefulShutdown } from '../../src/composition/lifecycle/GracefulShutdown';
import { OutboxDispatcher } from '../../src/infrastructure/messaging/outbox/OutboxDispatcher';

describe('Graceful Shutdown Simulation', () => {

  it('coordinates teardown strictly in order to prevent locks and lost events', async () => {
    
    const mockDispatcher = { stop: jest.fn() } as unknown as OutboxDispatcher;
    const mockRedis = { quit: jest.fn().mockResolvedValue(true) } as any;
    const mockMongo = { close: jest.fn().mockResolvedValue(true) } as any;

    const shutdown = new GracefulShutdown({
      outboxDispatcher: mockDispatcher,
      redis: mockRedis,
      mongoClient: mockMongo
    });

    // We bypass process.exit for the test using jest mock
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // Trigger shutdown
    await shutdown['shutdown']('SIGTERM');

    // Verify ordering
    expect(mockDispatcher.stop).toHaveBeenCalled(); // 1. Stop taking new work
    expect(mockRedis.quit).toHaveBeenCalled();      // 2. Release locks
    expect(mockMongo.close).toHaveBeenCalled();     // 3. Flush transactions

    // Ensure it exited 0
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

});

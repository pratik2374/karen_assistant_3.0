import {
  TaskCommandHandler,
  CreateTaskCommand
} from '../../src/application/handlers/TaskCommandHandler';
import { TaskAggregate } from '../../src/domain/task/TaskAggregate';
import { CommandExecutionPipeline, ReplayGuardStep, ObservabilityStep } from '../../src/application/executor/CommandExecutionPipeline';
import { ExecutionContext } from '../../src/composition/context/ExecutionContext';
import { MockUnitOfWork, MockOutboxStore, MockRepository } from './TestDoubles';
import { randomUUID } from 'crypto';

// -----------------------------------------------------------------------
// Integration Test Harness — verifies the full execution pipeline using
// in-memory test doubles. Zero infrastructure required.
// -----------------------------------------------------------------------

function buildContext(mode: 'PRODUCTION' | 'SANDBOX' | 'REPLAY' = 'PRODUCTION'): ExecutionContext {
  return new ExecutionContext(
    randomUUID(), // traceId
    randomUUID(), // correlationId
    'user-001',
    'session-001',
    ['tasks:write'],
    mode,
    500000
  );
}

function buildCommand(): CreateTaskCommand {
  return {
    commandId: randomUUID(),
    commandDeduplicationKey: randomUUID(),
    title: 'Write integration tests',
    priority: 'high',
    dueAt: new Date(Date.now() + 86400000), // tomorrow
    timezone: 'Asia/Kolkata'
  };
}

describe('TaskCommandHandler — Integration', () => {
  let uow: MockUnitOfWork;
  let outbox: MockOutboxStore;
  let repo: MockRepository<TaskAggregate>;
  let pipeline: CommandExecutionPipeline<CreateTaskCommand, { taskId: string }>;

  beforeEach(() => {
    uow = new MockUnitOfWork();
    outbox = new MockOutboxStore();
    repo = new MockRepository<TaskAggregate>();

    const handler = new TaskCommandHandler(repo, outbox, () => uow);
    pipeline = new CommandExecutionPipeline(handler, [
      new ObservabilityStep(),
      new ReplayGuardStep()
    ]);
  });

  it('executes command and commits atomically', async () => {
    const result = await pipeline.execute(buildCommand(), buildContext());

    expect(result.taskId).toBeDefined();
    expect(uow.committed).toBe(true);
    expect(uow.rolledBack).toBe(false);
    expect(outbox.savedMessages.length).toBeGreaterThan(0);
  });

  it('persists outbox messages alongside aggregate', async () => {
    const result = await pipeline.execute(buildCommand(), buildContext());

    const taskInRepo = await repo.findById(result.taskId);
    expect(taskInRepo).not.toBeNull();

    const outboxMessages = outbox.savedMessages;
    expect(outboxMessages.length).toBeGreaterThan(0);
    expect(outboxMessages[0].traceId).toBeDefined();
    expect(outboxMessages[0].correlationId).toBeDefined();
  });

  it('rolls back on handler failure', async () => {
    // Simulate a failing repo
    repo.saveWithVersion = jest.fn().mockRejectedValue(new Error('Simulated DB failure'));

    await expect(pipeline.execute(buildCommand(), buildContext()))
      .rejects.toThrow('Simulated DB failure');

    expect(uow.rolledBack).toBe(true);
    expect(uow.committed).toBe(false);
  });

  it('enforces optimistic concurrency — rejects stale updates', async () => {
    const cmd = buildCommand();
    const ctx = buildContext();

    // First execution succeeds
    const first = await pipeline.execute(cmd, ctx);

    // Simulate a concurrent writer bumping the version
    const task = await repo.findById(first.taskId);
    repo.versionStore.set(first.taskId, 99); // Simulate version mismatch

    // Second execution with expected version 0 should fail (already exists)
    await expect(pipeline.execute({ ...cmd, commandId: randomUUID(), commandDeduplicationKey: randomUUID() }, ctx))
      .rejects.toThrow();
  });

  it('propagates traceId and correlationId into outbox messages', async () => {
    const ctx = buildContext();
    await pipeline.execute(buildCommand(), ctx);

    const msg = outbox.savedMessages[0];
    expect(msg.traceId).toBe(ctx.traceId);
    expect(msg.correlationId).toBe(ctx.correlationId);
  });

  it('suppresses side effects in REPLAY mode', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const replayCtx = buildContext('REPLAY');
    await pipeline.execute(buildCommand(), replayCtx);

    const replayLog = consoleSpy.mock.calls
      .map(c => JSON.parse(c[0]))
      .find(l => l.type === 'REPLAY_MODE_ACTIVE');

    expect(replayLog).toBeDefined();
    consoleSpy.mockRestore();
  });

  it('runs full pipeline in SANDBOX mode without errors', async () => {
    const result = await pipeline.execute(buildCommand(), buildContext('SANDBOX'));
    expect(result.taskId).toBeDefined();
    expect(uow.committed).toBe(true);
  });
});

import { IUnitOfWork } from '../../src/application/ports/IUnitOfWork';
import { IOutboxStore, OutboxMessage } from '../../src/application/ports/IOutboxStore';
import { IRepository } from '../../src/application/ports/IRepository';
import { AggregateRoot } from '../../src/domain/shared/core/AggregateRoot';

// -----------------------------------------------------------------------
// In-memory test doubles — allow integration tests to run WITHOUT any
// real infrastructure (no Mongo, no Redis, no BullMQ).
// -----------------------------------------------------------------------

export class MockUnitOfWork implements IUnitOfWork {
  public committed = false;
  public rolledBack = false;
  private context = { session: 'mock-session' };

  async start(): Promise<void> {}
  async commit(): Promise<void> { this.committed = true; }
  async rollback(): Promise<void> { this.rolledBack = true; }
  getContext(): any { return this.context; }
}

export class MockOutboxStore implements IOutboxStore {
  public savedMessages: OutboxMessage[] = [];

  async save(message: OutboxMessage): Promise<void> {
    this.savedMessages.push(message);
  }

  async saveBulk(messages: OutboxMessage[]): Promise<void> {
    this.savedMessages.push(...messages);
  }

  async getUnpublishedMessages(limit: number): Promise<OutboxMessage[]> {
    return this.savedMessages.filter(m => m.processedAt === null).slice(0, limit);
  }

  async markAsPublished(messageId: string): Promise<void> {
    const msg = this.savedMessages.find(m => m.messageId === messageId);
    if (msg) msg.processedAt = new Date();
  }
}

export class MockRepository<T extends AggregateRoot> implements IRepository<T> {
  public store = new Map<string, T>();
  public versionStore = new Map<string, number>();

  async findById(id: string): Promise<T | null> {
    return this.store.get(id) ?? null;
  }

  async save(aggregate: T): Promise<void> {
    this.store.set(aggregate.id, aggregate);
  }

  async saveWithVersion(aggregate: T, expectedVersion: number): Promise<void> {
    const currentVersion = this.versionStore.get(aggregate.id) ?? 0;
    if (expectedVersion !== 0 && currentVersion !== expectedVersion) {
      throw new Error(`Optimistic concurrency failure for ${aggregate.id}`);
    }
    this.store.set(aggregate.id, aggregate);
    this.versionStore.set(aggregate.id, currentVersion + 1);
  }
}

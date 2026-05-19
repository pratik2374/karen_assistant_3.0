import { Worker, Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { ICalendarAdapter } from '../../application/ports/ICalendarAdapter.js';
import { CalendarProjectionMongoRepository } from '../persistence/mongo/repositories/CalendarProjectionMongoRepository.js';
import { CalendarSyncState } from '../../domain/calendar/CalendarEventProjection.js';
import { RuntimeEventBus } from '../../console/RuntimeEventBus.js';

export class CalendarSyncWorker {
  private worker: Worker;

  constructor(
    private redisConnection: Redis,
    private adapter: ICalendarAdapter,
    private projectionRepository: CalendarProjectionMongoRepository
  ) {
    this.worker = new Worker('calendar_sync_jobs', this.processJob.bind(this), {
      connection: this.redisConnection,
      concurrency: 2
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[CalendarSyncWorker] Job ${job?.id} failed: ${err.message}`);
    });
  }

  private async processJob(job: Job): Promise<void> {
    const { internalTaskId, operation, traceId } = job.data;
    
    const projection = await this.projectionRepository.findByInternalTaskId(internalTaskId);
    if (!projection) {
      console.warn(`[CalendarSyncWorker] Projection missing for task ${internalTaskId}. Skipping.`);
      return;
    }

    // Determine sandbox mode from environment or configuration globally
    // We will pass false for now, assuming adapter configuration handles it via isConfigured flag
    // Wait, let's pass a strict isSandbox check if needed. We'll pass false, but the adapter will fallback.
    const isSandbox = false;

    RuntimeEventBus.log('CALENDAR_SYNC_EXECUTION_START', 'SYSTEM',
      `Executing Google Calendar ${operation} for task ${internalTaskId}`,
      traceId
    );

    try {
      if (operation === 'CREATE') {
        const result = await this.adapter.createEvent(projection, isSandbox);
        
        if (result.success) {
          await this.projectionRepository.updateSyncState(
            internalTaskId,
            CalendarSyncState.SYNCED,
            result.etag,
            result.googleEventId
          );
        } else {
          await this.handleFailure(internalTaskId, result.error, result.isRetryable);
          if (result.isRetryable) throw new Error(result.error); // Trigger BullMQ retry
        }
      } 
      else if (operation === 'DELETE') {
        const result = await this.adapter.deleteEvent(projection, isSandbox);
        
        if (result.success) {
          await this.projectionRepository.updateSyncState(internalTaskId, CalendarSyncState.DELETING);
          // Physically we could remove it from mongo or keep it as DELETING/DELETED
        } else {
          await this.handleFailure(internalTaskId, result.error, result.isRetryable);
          if (result.isRetryable) throw new Error(result.error); // Trigger BullMQ retry
        }
      }
      else if (operation === 'UPDATE') {
        const result = await this.adapter.updateEvent(projection, isSandbox);
        
        if (result.success) {
          await this.projectionRepository.updateSyncState(
            internalTaskId,
            CalendarSyncState.SYNCED,
            result.etag,
            result.googleEventId
          );
        } else {
          await this.handleFailure(internalTaskId, result.error, result.isRetryable);
          if (result.isRetryable) throw new Error(result.error);
        }
      }
      
      RuntimeEventBus.log('CALENDAR_SYNC_EXECUTION_SUCCESS', 'SYSTEM',
        `Successfully executed Google Calendar ${operation} for task ${internalTaskId}`,
        traceId
      );
      
    } catch (err: any) {
      // Unhandled exceptions
      await this.handleFailure(internalTaskId, err.message, true);
      throw err; // Trigger BullMQ retry
    }
  }

  private async handleFailure(internalTaskId: string, error?: string, isRetryable?: boolean): Promise<void> {
    const newState = isRetryable ? CalendarSyncState.FAILED_RETRYABLE : CalendarSyncState.FAILED_FATAL;
    await this.projectionRepository.updateSyncState(internalTaskId, newState);
    console.error(`[CalendarSyncWorker] Sync failed for ${internalTaskId}. State: ${newState}. Error: ${error}`);
  }

  public async close(): Promise<void> {
    await this.worker.close();
  }
}

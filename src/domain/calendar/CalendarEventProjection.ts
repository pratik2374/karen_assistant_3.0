export enum CalendarSyncState {
  PENDING_CREATE = 'PENDING_CREATE',
  CREATING = 'CREATING',
  SYNCED = 'SYNCED',
  PENDING_UPDATE = 'PENDING_UPDATE',
  UPDATING = 'UPDATING',
  PENDING_DELETE = 'PENDING_DELETE',
  DELETING = 'DELETING',
  FAILED_RETRYABLE = 'FAILED_RETRYABLE',
  FAILED_FATAL = 'FAILED_FATAL',
  DRIFT_DETECTED = 'DRIFT_DETECTED',
  QUARANTINED = 'QUARANTINED'
}

export enum SyncConflictType {
  HARD_OVERLAP = 'HARD_OVERLAP',
  SOFT_OVERLAP = 'SOFT_OVERLAP',
  USER_BUSY = 'USER_BUSY',
  DND_VIOLATION = 'DND_VIOLATION',
  RECURRENCE_COLLISION = 'RECURRENCE_COLLISION',
  NONE = 'NONE'
}

export interface CalendarEventProjection {
  internalTaskId: string; // The aggregate ID of the Task/Reminder
  googleEventId?: string; // The actual Google Calendar event ID once created
  calendarId: string; // The calendar this is mapped to, e.g. 'primary'
  
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  
  // Recurrence
  recurrenceRule?: string;
  parentRecurringEventId?: string;
  recurrenceInstanceId?: string;
  
  // Lifecycle & Sync
  syncState: CalendarSyncState;
  lastExternalSyncAt?: Date;
  lastInternalMutationAt: Date;
  etag?: string;
  
  replaySafe: boolean; // Indicates if this event should be recreated during a replay
  version: number;
  
  createdBy: string;
  updatedBy: string;
}

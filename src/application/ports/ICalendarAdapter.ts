import { CalendarEventProjection, SyncConflictType } from '../../domain/calendar/CalendarEventProjection.js';

export interface CalendarEventPayload {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  recurrenceRule?: string;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflictType: SyncConflictType;
  conflictingEventIds: string[];
}

export interface CalendarSyncResult {
  success: boolean;
  googleEventId?: string;
  etag?: string;
  error?: string;
  isRetryable?: boolean;
}

export interface ICalendarAdapter {
  checkConflicts(event: CalendarEventPayload, isSandbox: boolean): Promise<ConflictCheckResult>;
  createEvent(projection: CalendarEventProjection, isSandbox: boolean): Promise<CalendarSyncResult>;
  updateEvent(projection: CalendarEventProjection, isSandbox: boolean): Promise<CalendarSyncResult>;
  deleteEvent(projection: CalendarEventProjection, isSandbox: boolean): Promise<CalendarSyncResult>;
  fetchExternalEvent(googleEventId: string, calendarId: string, isSandbox: boolean): Promise<any>;
  listEvents(timeMin: Date, timeMax: Date, isSandbox: boolean): Promise<any[]>;
}

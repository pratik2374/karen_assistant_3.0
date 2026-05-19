import { CalendarEventProjection } from '../../../domain/calendar/CalendarEventProjection.js';

export class GoogleCalendarMapper {
  
  public static toGoogleEvent(projection: CalendarEventProjection): any {
    const event: any = {
      summary: projection.title,
      description: projection.description || '',
      start: {
        dateTime: projection.startTime.toISOString(),
        timeZone: projection.timezone,
      },
      end: {
        dateTime: projection.endTime.toISOString(),
        timeZone: projection.timezone,
      }
    };

    if (projection.recurrenceRule) {
      event.recurrence = [projection.recurrenceRule];
    }
    
    // Add internal tracking metadata to Google Event extended properties
    event.extendedProperties = {
      private: {
        internalTaskId: projection.internalTaskId,
        managedBy: 'karen_assistant'
      }
    };

    return event;
  }
}

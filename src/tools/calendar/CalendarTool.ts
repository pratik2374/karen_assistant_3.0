import { ToolExecutionGateway } from '../../infrastructure/external/gateway/ToolExecutionGateway.js';
import { CircuitBreaker } from '../../infrastructure/resiliency/CircuitBreaker.js';
import { CalendarProjectionMongoRepository } from '../../infrastructure/persistence/mongo/repositories/CalendarProjectionMongoRepository.js';
import { CalendarSyncState } from '../../domain/calendar/CalendarEventProjection.js';
import { RuntimeEventBus } from '../../console/RuntimeEventBus.js';
import { ToolInput, ToolResult } from '../base/ITool.js';
import { randomUUID } from 'crypto';
import { google } from 'googleapis';

export interface CalendarEventInput {
  summary: string;
  description?: string;
  startDateTime: string;  // ISO 8601
  endDateTime: string;    // ISO 8601
  timezone?: string;
  location?: string;
  calendarId?: string;
}

export interface ComposioCalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  status?: string;
  htmlLink?: string;
  etag?: string;
}

export class CalendarTool extends ToolExecutionGateway {
  readonly name = 'CalendarTool';

  constructor(
    circuitBreaker: CircuitBreaker,
    public readonly composio: any, // Ignored, kept for backward-compatibility in injection
    private projectionRepo: CalendarProjectionMongoRepository
  ) {
    super(circuitBreaker);
  }

  private getCalendarClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Google OAuth credentials (ID, Secret, or Refresh Token) are missing from your .env file!');
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3000');
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return {
      calendarClient: google.calendar({ version: 'v3', auth: oauth2Client }),
      calendarId
    };
  }

  // ── List Events ───────────────────────────────────────────────────────────

  async listEvents(
    input: ToolInput & { timeMin: Date; timeMax: Date }
  ): Promise<ToolResult<ComposioCalendarEvent[]>> {
    const start = Date.now();
    RuntimeEventBus.log('TOOL_CALLED', 'SYSTEM',
      `CalendarTool.listEvents [${input.timeMin.toISOString()} → ${input.timeMax.toISOString()}]`,
      input.traceId
    );

    return this.execute(
      {
        operationName: 'CalendarTool.ListEvents',
        isReplay: input.isReplay,
        isSandbox: input.isSandbox,
        replaySafe: true,
        idempotencyKey: input.idempotencyKey,
        requiredScopes: ['READ_CALENDAR'],
      },
      async () => {
        const { calendarClient, calendarId } = this.getCalendarClient();
        const response = await calendarClient.events.list({
          calendarId,
          timeMin: input.timeMin.toISOString(),
          timeMax: input.timeMax.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        });
        const events = response.data.items || [];
        const mapped = events.map(e => ({
          id: e.id || undefined,
          summary: e.summary || undefined,
          description: e.description || undefined,
          start: e.start ? { dateTime: e.start.dateTime || undefined, date: e.start.date || undefined, timeZone: e.start.timeZone || undefined } : undefined,
          end: e.end ? { dateTime: e.end.dateTime || undefined, date: e.end.date || undefined, timeZone: e.end.timeZone || undefined } : undefined,
          location: e.location || undefined,
          status: e.status || undefined,
          htmlLink: e.htmlLink || undefined,
          etag: e.etag || undefined,
        }));

        RuntimeEventBus.log('TOOL_RESULT', 'SYSTEM',
          `CalendarTool.listEvents → ${mapped.length} events (${Date.now() - start}ms)`,
          input.traceId
        );
        return { success: true, data: mapped, latencyMs: Date.now() - start };
      },
      async () => {
        RuntimeEventBus.log('TOOL_RESULT', 'SYSTEM', `CalendarTool.listEvents [SANDBOX/REPLAY] → []`, input.traceId);
        return { success: true, data: [], latencyMs: 0 };
      }
    );
  }

  // ── Create Event ──────────────────────────────────────────────────────────

  async createEvent(
    input: ToolInput & { event: CalendarEventInput }
  ): Promise<ToolResult<ComposioCalendarEvent>> {
    const start = Date.now();
    RuntimeEventBus.log('TOOL_CALLED', 'SYSTEM',
      `CalendarTool.createEvent "${input.event.summary}"`,
      input.traceId
    );

    return this.execute(
      {
        operationName: 'CalendarTool.CreateEvent',
        isReplay: input.isReplay,
        isSandbox: input.isSandbox,
        replaySafe: false,
        idempotencyKey: input.idempotencyKey,
        requiredScopes: ['WRITE_CALENDAR'],
      },
      async () => {
        const { calendarClient, calendarId } = this.getCalendarClient();
        const response = await calendarClient.events.insert({
          calendarId: input.event.calendarId || calendarId,
          requestBody: {
            summary: input.event.summary,
            description: input.event.description,
            location: input.event.location,
            start: {
              dateTime: input.event.startDateTime,
              timeZone: input.event.timezone || 'Asia/Kolkata'
            },
            end: {
              dateTime: input.event.endDateTime,
              timeZone: input.event.timezone || 'Asia/Kolkata'
            }
          }
        });
        const e = response.data;
        const event: ComposioCalendarEvent = {
          id: e.id || undefined,
          summary: e.summary || undefined,
          description: e.description || undefined,
          start: e.start ? { dateTime: e.start.dateTime || undefined, date: e.start.date || undefined, timeZone: e.start.timeZone || undefined } : undefined,
          end: e.end ? { dateTime: e.end.dateTime || undefined, date: e.end.date || undefined, timeZone: e.end.timeZone || undefined } : undefined,
          location: e.location || undefined,
          status: e.status || undefined,
          htmlLink: e.htmlLink || undefined,
          etag: e.etag || undefined,
        };

        // Sync shadow projection immediately after successful creation
        if (event.id) {
          await this.upsertShadowProjection(event, input.userId, input.traceId);
        }

        RuntimeEventBus.log('TOOL_RESULT', 'SYSTEM',
          `CalendarTool.createEvent → eventId: ${event.id} (${Date.now() - start}ms)`,
          input.traceId
        );
        return {
          success: true,
          data: event,
          externalEventId: event.id,
          etag: event.etag,
          latencyMs: Date.now() - start
        };
      },
      async () => {
        RuntimeEventBus.log('TOOL_RESULT', 'SYSTEM', `CalendarTool.createEvent [SANDBOX] → mocked`, input.traceId);
        return { 
          success: true, 
          data: { id: 'sandbox-event-id', summary: input.event.summary }, 
          externalEventId: 'sandbox-event-id',
          etag: undefined,
          latencyMs: 0 
        };
      }
    );
  }

  // ── Update Event ──────────────────────────────────────────────────────────

  async updateEvent(
    input: ToolInput & { eventId: string; event: Partial<CalendarEventInput> }
  ): Promise<ToolResult<ComposioCalendarEvent>> {
    const start = Date.now();
    RuntimeEventBus.log('TOOL_CALLED', 'SYSTEM',
      `CalendarTool.updateEvent eventId="${input.eventId}"`,
      input.traceId
    );

    return this.execute(
      {
        operationName: 'CalendarTool.UpdateEvent',
        isReplay: input.isReplay,
        isSandbox: input.isSandbox,
        replaySafe: false,
        idempotencyKey: input.idempotencyKey,
        requiredScopes: ['WRITE_CALENDAR'],
      },
      async () => {
        const { calendarClient, calendarId } = this.getCalendarClient();
        const requestBody: any = {};
        if (input.event.summary !== undefined) requestBody.summary = input.event.summary;
        if (input.event.description !== undefined) requestBody.description = input.event.description;
        if (input.event.location !== undefined) requestBody.location = input.event.location;
        if (input.event.startDateTime !== undefined) {
          requestBody.start = {
            dateTime: input.event.startDateTime,
            timeZone: input.event.timezone || 'Asia/Kolkata'
          };
        }
        if (input.event.endDateTime !== undefined) {
          requestBody.end = {
            dateTime: input.event.endDateTime,
            timeZone: input.event.timezone || 'Asia/Kolkata'
          };
        }

        const response = await calendarClient.events.patch({
          calendarId: input.event.calendarId || calendarId,
          eventId: input.eventId,
          requestBody
        });
        const e = response.data;
        const event: ComposioCalendarEvent = {
          id: e.id || undefined,
          summary: e.summary || undefined,
          description: e.description || undefined,
          start: e.start ? { dateTime: e.start.dateTime || undefined, date: e.start.date || undefined, timeZone: e.start.timeZone || undefined } : undefined,
          end: e.end ? { dateTime: e.end.dateTime || undefined, date: e.end.date || undefined, timeZone: e.end.timeZone || undefined } : undefined,
          location: e.location || undefined,
          status: e.status || undefined,
          htmlLink: e.htmlLink || undefined,
          etag: e.etag || undefined,
        };

        if (event.id) {
          await this.upsertShadowProjection(event, input.userId, input.traceId);
        }

        RuntimeEventBus.log('TOOL_RESULT', 'SYSTEM',
          `CalendarTool.updateEvent → eventId: ${input.eventId} (${Date.now() - start}ms)`,
          input.traceId
        );
        return { success: true, data: event, externalEventId: event.id, latencyMs: Date.now() - start };
      },
      async () => {
        return { success: true, data: { id: input.eventId }, externalEventId: input.eventId, latencyMs: 0 };
      }
    );
  }

  // ── Delete Event ──────────────────────────────────────────────────────────

  async deleteEvent(
    input: ToolInput & { eventId: string }
  ): Promise<ToolResult<void>> {
    const start = Date.now();
    RuntimeEventBus.log('TOOL_CALLED', 'SYSTEM',
      `CalendarTool.deleteEvent eventId="${input.eventId}"`,
      input.traceId
    );

    return this.execute(
      {
        operationName: 'CalendarTool.DeleteEvent',
        isReplay: input.isReplay,
        isSandbox: input.isSandbox,
        replaySafe: false,
        idempotencyKey: input.idempotencyKey,
        requiredScopes: ['WRITE_CALENDAR'],
      },
      async () => {
        const { calendarClient, calendarId } = this.getCalendarClient();
        await calendarClient.events.delete({
          calendarId,
          eventId: input.eventId,
        });

        // Archive projection
        const existing = await this.projectionRepo.findByGoogleEventId(input.eventId);
        if (existing) {
          existing.syncState = CalendarSyncState.PENDING_DELETE;
          await this.projectionRepo.save(existing);
        }

        RuntimeEventBus.log('TOOL_RESULT', 'SYSTEM',
          `CalendarTool.deleteEvent → done (${Date.now() - start}ms)`,
          input.traceId
        );
        return { success: true, latencyMs: Date.now() - start };
      },
      async () => {
        return { success: true, latencyMs: 0 };
      }
    );
  }

  // ── Find Events ───────────────────────────────────────────────────────────

  async findEvents(
    input: ToolInput & { query: string; timeMin: Date; timeMax: Date }
  ): Promise<ToolResult<ComposioCalendarEvent[]>> {
    const start = Date.now();
    RuntimeEventBus.log('TOOL_CALLED', 'SYSTEM',
      `CalendarTool.findEvents query="${input.query}"`,
      input.traceId
    );

    return this.execute(
      {
        operationName: 'CalendarTool.FindEvents',
        isReplay: input.isReplay,
        isSandbox: input.isSandbox,
        replaySafe: true,
        idempotencyKey: input.idempotencyKey,
        requiredScopes: ['READ_CALENDAR'],
      },
      async () => {
        const { calendarClient, calendarId } = this.getCalendarClient();
        const response = await calendarClient.events.list({
          calendarId,
          q: input.query,
          timeMin: input.timeMin.toISOString(),
          timeMax: input.timeMax.toISOString(),
          singleEvents: true,
        });
        const events = response.data.items || [];
        const mapped = events.map(e => ({
          id: e.id || undefined,
          summary: e.summary || undefined,
          description: e.description || undefined,
          start: e.start ? { dateTime: e.start.dateTime || undefined, date: e.start.date || undefined, timeZone: e.start.timeZone || undefined } : undefined,
          end: e.end ? { dateTime: e.end.dateTime || undefined, date: e.end.date || undefined, timeZone: e.end.timeZone || undefined } : undefined,
          location: e.location || undefined,
          status: e.status || undefined,
          htmlLink: e.htmlLink || undefined,
          etag: e.etag || undefined,
        }));

        RuntimeEventBus.log('TOOL_RESULT', 'SYSTEM',
          `CalendarTool.findEvents → ${mapped.length} results (${Date.now() - start}ms)`,
          input.traceId
        );
        return { success: true, data: mapped, latencyMs: Date.now() - start };
      },
      async () => {
        return { success: true, data: [], latencyMs: 0 };
      }
    );
  }

  // ── Private: Shadow Projection Upsert ────────────────────────────────────

  private async upsertShadowProjection(
    event: ComposioCalendarEvent,
    userId: string,
    traceId: string
  ): Promise<void> {
    try {
      const existing = await this.projectionRepo.findByGoogleEventId(event.id!);
      const internalId = existing?.internalTaskId ?? randomUUID();
      const startTime = new Date(event.start?.dateTime || event.start?.date || new Date());
      const endTime = new Date(event.end?.dateTime || event.end?.date || new Date());

      await this.projectionRepo.save({
        internalTaskId: internalId,
        googleEventId: event.id,
        calendarId: 'primary',
        title: event.summary || 'Untitled Event',
        description: event.description,
        startTime,
        endTime,
        timezone: event.start?.timeZone || 'Asia/Kolkata',
        syncState: CalendarSyncState.SYNCED,
        lastExternalSyncAt: new Date(),
        lastInternalMutationAt: new Date(),
        etag: event.etag,
        replaySafe: false,
        version: (existing?.version ?? 0) + 1,
        createdBy: userId,
        updatedBy: userId,
      });

      RuntimeEventBus.log('SHADOW_PROJECTION_SYNC', 'SYSTEM',
        `Shadow projection upserted for eventId: ${event.id}`,
        traceId
      );
    } catch (err: any) {
      console.error('[CalendarTool] Shadow projection upsert failed:', err.message);
    }
  }
}

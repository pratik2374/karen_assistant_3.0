import { IAgent, AgentContext, AgentExecutionResult } from '../base/IAgent.js';
import { CalendarTool } from '../../tools/calendar/CalendarTool.js';
import { CalendarProjectionMongoRepository } from '../../infrastructure/persistence/mongo/repositories/CalendarProjectionMongoRepository.js';
import { RuntimeEventBus } from '../../console/RuntimeEventBus.js';
import { randomUUID } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// CalendarAgent — Domain coordinator for all calendar-related intents.
//
// GOVERNANCE RULES:
//  - This agent NEVER communicates directly with users.
//  - All external API calls route through CalendarTool only.
//  - Results return upward to Karen via AgentExecutionResult.summaryReport.
//  - Agent is stateless; all state is managed through repository or tool.
//  - Replay mode: CalendarTool handles suppression of all side effects.
//
// Handled intents:
//  - list_tasks         → fetch events from Google Calendar via CalendarTool
//  - query_calendar     → alias for list_tasks
//  - create_calendar_event → create event via CalendarTool
//  - update_calendar_event → update event via CalendarTool
//  - delete_calendar_event → delete event via CalendarTool
//  - find_calendar_event  → search events via CalendarTool
// ─────────────────────────────────────────────────────────────────────────────

export class CalendarAgent implements IAgent {
  readonly name = 'CalendarAgent';
  readonly domain = 'calendar';
  readonly capabilities = [
    'list_tasks',
    'query_calendar',
    'create_calendar_event',
    'update_calendar_event',
    'delete_calendar_event',
    'find_calendar_event',
  ];

  constructor(
    private calendarTool: CalendarTool,
    private projectionRepo: CalendarProjectionMongoRepository
  ) {}

  async execute(context: AgentContext): Promise<AgentExecutionResult> {
    const start = Date.now();

    RuntimeEventBus.log('AGENT_STARTED', 'AGENT',
      `CalendarAgent executing intent: ${context.intent}`,
      context.traceId
    );

    try {
      let result: AgentExecutionResult;

      switch (context.intent) {
        case 'list_tasks':
        case 'query_calendar':
          result = await this.handleListEvents(context);
          break;
        case 'create_calendar_event':
          result = await this.handleCreateEvent(context);
          break;
        case 'update_calendar_event':
          result = await this.handleUpdateEvent(context);
          break;
        case 'delete_calendar_event':
          result = await this.handleDeleteEvent(context);
          break;
        case 'find_calendar_event':
          result = await this.handleFindEvents(context);
          break;
        default:
          result = {
            status: 'FAILED',
            data: {},
            summaryReport: `CalendarAgent does not handle intent: ${context.intent}`,
            mutationsCount: 0,
            latencyMs: Date.now() - start,
            errorCode: 'UNSUPPORTED_INTENT',
          };
      }

      RuntimeEventBus.log('AGENT_COMPLETED', 'AGENT',
        `CalendarAgent ${result.status} | ${result.latencyMs}ms | intent: ${context.intent}`,
        context.traceId
      );

      return result;

    } catch (err: any) {
      RuntimeEventBus.log('AGENT_FAILED', 'ERROR',
        `CalendarAgent failed: ${err.message}`,
        context.traceId
      );
      return {
        status: 'FAILED',
        data: {},
        summaryReport: `Calendar operation failed: ${err.message}`,
        mutationsCount: 0,
        latencyMs: Date.now() - start,
        errorCode: 'AGENT_EXECUTION_ERROR',
      };
    }
  }

  // ── Intent Handlers ───────────────────────────────────────────────────────

  private async handleListEvents(context: AgentContext): Promise<AgentExecutionResult> {
    const start = Date.now();
    const { payload } = context;

    // Determine the date range from payload
    let timeMin: Date;
    let timeMax: Date;

    if (payload.targetDate) {
      timeMin = new Date(payload.targetDate);
      timeMin.setHours(0, 0, 0, 0);
      timeMax = new Date(timeMin);
      timeMax.setDate(timeMax.getDate() + 1);
    } else if (payload.startDate && payload.endDate) {
      timeMin = new Date(payload.startDate);
      timeMax = new Date(payload.endDate);
    } else {
      // Default: next 7 days
      timeMin = new Date();
      timeMin.setHours(0, 0, 0, 0);
      timeMax = new Date(timeMin);
      timeMax.setDate(timeMax.getDate() + 7);
    }

    const toolResult = await this.calendarTool.listEvents({
      userId: context.userId,
      payload: {},
      traceId: context.traceId,
      correlationId: context.correlationId,
      isReplay: context.isReplay,
      isSandbox: context.isSandbox,
      idempotencyKey: `list-events-${context.userId}-${timeMin.getTime()}`,
      timeMin,
      timeMax,
    });

    if (!toolResult.success) {
      return {
        status: 'FAILED',
        data: {},
        summaryReport: `I couldn't fetch your calendar events right now. Please try again.`,
        mutationsCount: 0,
        latencyMs: Date.now() - start,
      };
    }

    const events = toolResult.data ?? [];

    let summaryReport: string;
    if (events.length === 0) {
      summaryReport = `Your calendar is completely clear for that period! No events found.`;
    } else {
      summaryReport = `📅 *Here's your schedule:*\n\n`;
      events.forEach((evt, index) => {
        const startStr = evt.start?.dateTime || evt.start?.date;
        const timeStr = startStr
          ? new Date(startStr).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: evt.start?.timeZone || 'Asia/Kolkata',
            })
          : 'All day';
        summaryReport += `${index + 1}. [${timeStr}] ${evt.summary || 'Untitled'}\n`;
      });
    }

    return {
      status: 'SUCCESS',
      data: { events },
      summaryReport,
      mutationsCount: 0,
      latencyMs: Date.now() - start,
    };
  }

  private async handleCreateEvent(context: AgentContext): Promise<AgentExecutionResult> {
    const start = Date.now();
    const { payload } = context;

    if (!payload.summary || !payload.startDateTime || !payload.endDateTime) {
      return {
        status: 'NEEDS_CLARIFICATION',
        data: {},
        summaryReport: 'To create a calendar event, I need the event title, start time, and end time.',
        mutationsCount: 0,
        latencyMs: Date.now() - start,
      };
    }

    const toolResult = await this.calendarTool.createEvent({
      userId: context.userId,
      payload: {},
      traceId: context.traceId,
      correlationId: context.correlationId,
      isReplay: context.isReplay,
      isSandbox: context.isSandbox,
      idempotencyKey: `create-event-${context.correlationId}`,
      event: {
        summary: payload.summary,
        description: payload.description,
        startDateTime: payload.startDateTime,
        endDateTime: payload.endDateTime,
        timezone: payload.timezone || 'Asia/Kolkata',
        location: payload.location,
      },
    });

    if (!toolResult.success) {
      return {
        status: 'FAILED',
        data: {},
        summaryReport: `Failed to create calendar event: ${toolResult.error}`,
        mutationsCount: 0,
        latencyMs: Date.now() - start,
      };
    }

    const event = toolResult.data!;
    return {
      status: 'SUCCESS',
      data: { event, googleEventId: toolResult.externalEventId },
      summaryReport: `✅ Event *"${payload.summary}"* has been created on your Google Calendar.\n🔗 ${event.htmlLink || ''}`,
      mutationsCount: 1,
      latencyMs: Date.now() - start,
    };
  }

  private async handleUpdateEvent(context: AgentContext): Promise<AgentExecutionResult> {
    const start = Date.now();
    const { payload } = context;

    if (!payload.eventId) {
      return {
        status: 'NEEDS_CLARIFICATION',
        data: {},
        summaryReport: 'To update an event, I need the event ID.',
        mutationsCount: 0,
        latencyMs: Date.now() - start,
      };
    }

    const toolResult = await this.calendarTool.updateEvent({
      userId: context.userId,
      payload: {},
      traceId: context.traceId,
      correlationId: context.correlationId,
      isReplay: context.isReplay,
      isSandbox: context.isSandbox,
      idempotencyKey: `update-event-${payload.eventId}-${context.correlationId}`,
      eventId: payload.eventId,
      event: {
        summary: payload.summary,
        description: payload.description,
        startDateTime: payload.startDateTime,
        endDateTime: payload.endDateTime,
        timezone: payload.timezone,
      },
    });

    return {
      status: toolResult.success ? 'SUCCESS' : 'FAILED',
      data: { event: toolResult.data },
      summaryReport: toolResult.success
        ? `✅ Event has been updated on your Google Calendar.`
        : `Failed to update event: ${toolResult.error}`,
      mutationsCount: toolResult.success ? 1 : 0,
      latencyMs: Date.now() - start,
    };
  }

  private async handleDeleteEvent(context: AgentContext): Promise<AgentExecutionResult> {
    const start = Date.now();
    const { payload } = context;

    if (!payload.eventId) {
      return {
        status: 'NEEDS_CLARIFICATION',
        data: {},
        summaryReport: 'To delete an event, I need the event ID.',
        mutationsCount: 0,
        latencyMs: Date.now() - start,
      };
    }

    const toolResult = await this.calendarTool.deleteEvent({
      userId: context.userId,
      payload: {},
      traceId: context.traceId,
      correlationId: context.correlationId,
      isReplay: context.isReplay,
      isSandbox: context.isSandbox,
      idempotencyKey: `delete-event-${payload.eventId}-${context.correlationId}`,
      eventId: payload.eventId,
    });

    return {
      status: toolResult.success ? 'SUCCESS' : 'FAILED',
      data: {},
      summaryReport: toolResult.success
        ? `🗑️ Event has been deleted from your Google Calendar.`
        : `Failed to delete event: ${toolResult.error}`,
      mutationsCount: toolResult.success ? 1 : 0,
      latencyMs: Date.now() - start,
    };
  }

  private async handleFindEvents(context: AgentContext): Promise<AgentExecutionResult> {
    const start = Date.now();
    const { payload } = context;

    const timeMin = payload.timeMin ? new Date(payload.timeMin) : new Date();
    const timeMax = payload.timeMax ? new Date(payload.timeMax) : (() => {
      const d = new Date(); d.setDate(d.getDate() + 30); return d;
    })();

    const toolResult = await this.calendarTool.findEvents({
      userId: context.userId,
      payload: {},
      traceId: context.traceId,
      correlationId: context.correlationId,
      isReplay: context.isReplay,
      isSandbox: context.isSandbox,
      idempotencyKey: `find-events-${context.userId}-${payload.query}`,
      query: payload.query || '',
      timeMin,
      timeMax,
    });

    const events = toolResult.data ?? [];
    const summaryReport = events.length === 0
      ? `No events found matching "${payload.query}".`
      : `Found ${events.length} event(s) matching "${payload.query}":\n` +
        events.map((e, i) => `${i + 1}. ${e.summary}`).join('\n');

    return {
      status: toolResult.success ? 'SUCCESS' : 'FAILED',
      data: { events },
      summaryReport,
      mutationsCount: 0,
      latencyMs: Date.now() - start,
    };
  }
}

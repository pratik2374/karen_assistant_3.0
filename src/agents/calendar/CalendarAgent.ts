// @ts-nocheck
import { IAgent, AgentContext, AgentExecutionResult } from '../base/IAgent.js';
import { CalendarTool } from '../../tools/calendar/CalendarTool.js';
import { CalendarProjectionMongoRepository } from '../../infrastructure/persistence/mongo/repositories/CalendarProjectionMongoRepository.js';
import { RuntimeEventBus } from '../../console/RuntimeEventBus.js';
import { OpenAI, OpenAIAgent } from '@llamaindex/openai';
import { FunctionTool } from 'llamaindex';
import { google } from 'googleapis';
import * as dotenv from 'dotenv';
dotenv.config();

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

    RuntimeEventBus.log('AGENT_STARTED', 'AI',
      `CalendarAgent executing intent via native Google Calendar: ${context.intent}`,
      context.traceId
    );

    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is missing from environment variables');
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

      if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Google OAuth credentials (ID, Secret, or Refresh Token) are missing from your .env file!');
      }

      // Initialize Google OAuth2 and Calendar clients
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3000');
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const calendarClient = google.calendar({ version: 'v3', auth: oauth2Client });

      // Define native tools for LlamaIndex

      const fetchTodayTool = FunctionTool.from(
        async () => {
          RuntimeEventBus.log('CALENDAR_AGENT_TOOL', 'SYSTEM', "Listing today's calendar events", context.traceId);
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          const endOfToday = new Date();
          endOfToday.setHours(23, 59, 59, 999);

          const response = await calendarClient.events.list({
            calendarId: calendarId,
            timeMin: startOfToday.toISOString(),
            timeMax: endOfToday.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
          });

          const events = response.data.items || [];
          return events.map(e => ({
            id: e.id,
            summary: e.summary,
            description: e.description,
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            location: e.location
          }));
        },
        {
          name: 'fetch_calendar_events_today',
          description: "Get a list of all calendar events scheduled for today in the user's Google Calendar.",
          parameters: { type: 'object', properties: {} }
        }
      );

      const searchEventsTool = FunctionTool.from(
        async (args: { query?: string; timeMin?: string; timeMax?: string }) => {
          RuntimeEventBus.log('CALENDAR_AGENT_TOOL', 'SYSTEM', `Searching calendar events (query="${args.query || ''}", timeMin="${args.timeMin || ''}", timeMax="${args.timeMax || ''}")`, context.traceId);
          const response = await calendarClient.events.list({
            calendarId: calendarId,
            q: args.query,
            timeMin: args.timeMin,
            timeMax: args.timeMax,
            singleEvents: true,
          });

          const events = response.data.items || [];
          return events.map(e => ({
            id: e.id,
            summary: e.summary,
            description: e.description,
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            location: e.location
          }));
        },
        {
          name: 'find_calendar_events_by_timeline',
          description: 'Search for calendar events using a keyword query or specific start/end ISO datetime limits.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Keyword to search for in event titles/descriptions.' },
              timeMin: { type: 'string', description: 'ISO 8601 start time limit, e.g. YYYY-MM-DDTHH:mm:ss' },
              timeMax: { type: 'string', description: 'ISO 8601 end time limit, e.g. YYYY-MM-DDTHH:mm:ss' }
            }
          }
        }
      );

      const createEventTool = FunctionTool.from(
        async (args: { summary: string; description?: string; startTime: string; endTime: string; location?: string }) => {
          RuntimeEventBus.log('CALENDAR_AGENT_TOOL', 'SYSTEM', `Creating calendar event: "${args.summary}"`, context.traceId);
          const eventBody = {
            summary: args.summary,
            description: args.description,
            location: args.location,
            start: {
              dateTime: args.startTime,
              timeZone: 'Asia/Kolkata',
            },
            end: {
              dateTime: args.endTime,
              timeZone: 'Asia/Kolkata',
            },
          };

          const response = await calendarClient.events.insert({
            calendarId: calendarId,
            requestBody: eventBody,
          });

          return {
            status: 'CREATED',
            message: `Successfully created event "${args.summary}".`,
            eventId: response.data.id,
            summary: response.data.summary,
            start: response.data.start?.dateTime,
            end: response.data.end?.dateTime
          };
        },
        {
          name: 'create_calendar_event',
          description: 'Create a new calendar event in Google Calendar.',
          parameters: {
            type: 'object',
            properties: {
              summary: { type: 'string', description: 'The title/summary of the calendar event.' },
              description: { type: 'string', description: 'Detailed description of the event.' },
              startTime: { type: 'string', description: 'ISO 8601 start time (Asia/Kolkata local time, format YYYY-MM-DDTHH:mm:ss).' },
              endTime: { type: 'string', description: 'ISO 8601 end time (Asia/Kolkata local time, format YYYY-MM-DDTHH:mm:ss).' },
              location: { type: 'string', description: 'Location of the meeting.' }
            },
            required: ['summary', 'startTime', 'endTime']
          }
        }
      );

      const updateEventTool = FunctionTool.from(
        async (args: { eventId: string; summary?: string; description?: string; startTime?: string; endTime?: string; location?: string }) => {
          RuntimeEventBus.log('CALENDAR_AGENT_TOOL', 'SYSTEM', `Updating calendar event ID: "${args.eventId}"`, context.traceId);
          
          const getResponse = await calendarClient.events.get({
            calendarId: calendarId,
            eventId: args.eventId,
          });

          const existing = getResponse.data;

          const updatedBody = {
            summary: args.summary !== undefined ? args.summary : existing.summary,
            description: args.description !== undefined ? args.description : existing.description,
            location: args.location !== undefined ? args.location : existing.location,
            start: args.startTime ? {
              dateTime: args.startTime,
              timeZone: 'Asia/Kolkata',
            } : existing.start,
            end: args.endTime ? {
              dateTime: args.endTime,
              timeZone: 'Asia/Kolkata',
            } : existing.end,
          };

          const response = await calendarClient.events.update({
            calendarId: calendarId,
            eventId: args.eventId,
            requestBody: updatedBody,
          });

          return {
            status: 'UPDATED',
            message: `Successfully updated event "${response.data.summary}".`,
            eventId: response.data.id,
            summary: response.data.summary,
            start: response.data.start?.dateTime,
            end: response.data.end?.dateTime
          };
        },
        {
          name: 'update_calendar_event',
          description: 'Update/modify an existing calendar event details or reschedule it using its unique eventId.',
          parameters: {
            type: 'object',
            properties: {
              eventId: { type: 'string', description: 'The unique eventId of the calendar event to update.' },
              summary: { type: 'string', description: 'Optional new title/summary.' },
              description: { type: 'string', description: 'Optional new description.' },
              startTime: { type: 'string', description: 'Optional new ISO 8601 start time (Asia/Kolkata, format YYYY-MM-DDTHH:mm:ss).' },
              endTime: { type: 'string', description: 'Optional new ISO 8601 end time (Asia/Kolkata, format YYYY-MM-DDTHH:mm:ss).' },
              location: { type: 'string', description: 'Optional new location.' }
            },
            required: ['eventId']
          }
        }
      );

      const deleteEventTool = FunctionTool.from(
        async (args: { eventId: string }) => {
          RuntimeEventBus.log('CALENDAR_AGENT_TOOL', 'SYSTEM', `Deleting calendar event ID: "${args.eventId}"`, context.traceId);
          await calendarClient.events.delete({
            calendarId: calendarId,
            eventId: args.eventId,
          });

          return {
            status: 'DELETED',
            message: `Successfully deleted event "${args.eventId}" from the calendar.`
          };
        },
        {
          name: 'delete_calendar_event',
          description: 'Delete/remove an event from Google Calendar using its unique eventId.',
          parameters: {
            type: 'object',
            properties: {
              eventId: { type: 'string', description: 'The unique eventId of the event to delete.' }
            },
            required: ['eventId']
          }
        }
      );

      // Initialize OpenAI LLM
      const llm = new OpenAI({
        apiKey,
        model: 'gpt-5.4-mini',
        temperature: 0,
      });

      // Initialize LlamaIndex Agent with the 5 native Google Calendar tools
      const agent = new OpenAIAgent({
        tools: [fetchTodayTool, searchEventsTool, createEventTool, updateEventTool, deleteEventTool],
        llm,
        verbose: true,
      });

      const userQuery = context.payload.userQuery || context.payload.query || '';
      const now = new Date();
      const localTimeKolkata = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
      const localDateKolkataStr = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toDateString();
      
      const query = `
You are a specialized Calendar Assistant. Your task is to fulfill the following intent using the tools provided.
Intent: ${context.intent}
Parameters Extracted by User: ${JSON.stringify(context.payload)}
Original User Query: "${userQuery}"

SYSTEM TIME CONTEXT:
- Current UTC Time: ${now.toISOString()}
- User Timezone: Asia/Kolkata
- Current User Local Time (IST): ${localTimeKolkata}
- Today's Date (in User Timezone): ${localDateKolkataStr}

When creating or modifying events, you MUST strictly use the User Timezone (Asia/Kolkata).
If the user specifies a relative time like "after 20 minutes" or "tomorrow at 9 AM", calculate it relative to the Current User Local Time (IST) listed above: ${localTimeKolkata}.
For example, if it is 6:29 PM IST, "after 20 minutes" is 6:49 PM IST on the same day.
Ensure you pass the local ISO 8601 datetime strings to the tool WITHOUT any timezone offset or Z suffix (e.g., YYYY-MM-DDTHH:mm:ss, like '2026-05-21T18:49:17'), and ALWAYS explicitly set the timezone parameter to 'Asia/Kolkata'. Do NOT include '+05:30' or 'Z' in the start_datetime or end_datetime strings.

Please execute the necessary calendar operations. Use the provided tools to query or mutate Google Calendar.
Return a concise, human-readable summary of the actions taken and the data retrieved.
Do not invent or hallucinate events. 
`;

      const response = await agent.chat({
        message: query,
      });

      const summaryReport = response.toString();

      RuntimeEventBus.log('AGENT_COMPLETED', 'AI',
        `CalendarAgent SUCCESS | ${Date.now() - start}ms | intent: ${context.intent}`,
        context.traceId
      );

      // Emit calendar mutation completed events to trigger background shadow projections sync
      const mutatingIntents = ['create_calendar_event', 'update_calendar_event', 'delete_calendar_event'];
      if (mutatingIntents.includes(context.intent)) {
        RuntimeEventBus.emit({
          type: 'CALENDAR_MUTATION_COMPLETED',
          category: 'SYSTEM',
          message: `Calendar mutation intent "${context.intent}" completed successfully natively.`,
          traceId: context.traceId,
          timestamp: new Date()
        });

        if (context.intent === 'create_calendar_event') {
          RuntimeEventBus.emit({
            type: 'CALENDAR_EVENT_CREATED_MANUALLY',
            category: 'DOMAIN',
            message: `Fast-tracking reminder for manual calendar creation`,
            traceId: context.traceId,
            timestamp: new Date(),
            metadata: {
              title: context.payload.title || context.payload.summary,
              start: context.payload.start || context.payload.startTime,
              end: context.payload.end || context.payload.endTime,
              userId: context.userId
            }
          });
        }
      }

      return {
        status: 'SUCCESS',
        data: {},
        summaryReport,
        mutationsCount: 1, 
        latencyMs: Date.now() - start,
      };

    } catch (err: any) {
      RuntimeEventBus.log('AGENT_FAILED', 'ERROR',
        `CalendarAgent failed natively: ${err.message}`,
        context.traceId
      );
      const safeErrorMessage = err.message.length > 1000 ? err.message.substring(0, 1000) + '... [truncated]' : err.message;
      return {
        status: 'FAILED',
        data: {},
        summaryReport: `Calendar operation failed: ${safeErrorMessage}`,
        mutationsCount: 0,
        latencyMs: Date.now() - start,
        errorCode: 'AGENT_EXECUTION_ERROR',
      };
    }
  }
}

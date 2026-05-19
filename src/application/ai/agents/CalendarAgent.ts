import { ICalendarAdapter } from '../../ports/ICalendarAdapter.js';
import { CalendarProjectionMongoRepository } from '../../../infrastructure/persistence/mongo/repositories/CalendarProjectionMongoRepository.js';
import { RuntimeEventBus } from '../../../console/RuntimeEventBus.js';

export interface IAgentGoal {
  intent: string;
  targetCount: number;
  description: string;
  riskLevel: 'LOW' | 'HIGH';
}

export interface IAgentResult {
  status: 'SUCCESS' | 'FAILED';
  summaryReport: string;
  mutationsCount: number;
  rawPayload?: any;
}

export interface ISubAgent {
  name: string;
  establishGoal(query: string, context: any): Promise<IAgentGoal>;
  execute(goal: IAgentGoal, context: any): Promise<IAgentResult>;
}

export class CalendarAgent implements ISubAgent {
  name = 'CalendarAgent';

  constructor(
    private adapter: ICalendarAdapter,
    private projectionRepo: CalendarProjectionMongoRepository
  ) {}

  async establishGoal(query: string, context: any): Promise<IAgentGoal> {
    // For now, this agent primarily handles 'list_tasks' intent
    return {
      intent: 'list_tasks',
      targetCount: 0,
      description: 'Fetch active schedule from Google Calendar',
      riskLevel: 'LOW'
    };
  }

  async execute(goal: IAgentGoal, context: any): Promise<IAgentResult> {
    const traceId = context.traceId || 'unknown-trace';
    
    RuntimeEventBus.log('AGENT_EXECUTION', 'AI', 
      `CalendarAgent executing goal: ${goal.intent}`, 
      traceId
    );

    try {
      if (goal.intent === 'list_tasks') {
        const targetDate = context.targetDate || new Date();
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfPeriod = new Date(startOfDay);
        // If it's asking for a week, we would adjust this. For now default to 7 days ahead.
        endOfPeriod.setDate(startOfDay.getDate() + 7);

        // Fetch DIRECTLY from real calendar!
        const events = await this.adapter.listEvents(startOfDay, endOfPeriod, false);
        
        // Sync them briefly to local projections if they don't exist
        let addedCount = 0;
        for (const evt of events) {
          const existing = await this.projectionRepo.findByGoogleEventId(evt.id);
          if (!existing) {
            // We just note that we found native events. The BootSyncCoordinator will handle full reconciliation.
            addedCount++;
          }
        }

        let summary = "Here is your requested schedule from Google Calendar:\n\n";
        if (events.length === 0) {
          summary = "Your calendar is completely clear! No upcoming tasks found.";
        } else {
          events.forEach((p: any, index: number) => {
            const startTime = p.start?.dateTime || p.start?.date;
            const timeStr = new Date(startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: p.start?.timeZone || 'Asia/Kolkata' });
            summary += `${index + 1}. [${timeStr}] ${p.summary}\n`;
          });
        }

        return {
          status: 'SUCCESS',
          summaryReport: summary,
          mutationsCount: addedCount,
          rawPayload: events
        };
      }

      throw new Error(`Unsupported goal intent: ${goal.intent}`);
    } catch (err: any) {
      console.error('[CalendarAgent] Execution failed:', err);
      return {
        status: 'FAILED',
        summaryReport: `I ran into an issue interacting with your calendar: ${err.message}`,
        mutationsCount: 0
      };
    }
  }
}

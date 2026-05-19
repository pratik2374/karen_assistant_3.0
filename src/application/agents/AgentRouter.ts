import { IAgent, AgentContext, AgentExecutionResult } from '../base/IAgent.js';
import { CalendarAgent } from '../calendar/CalendarAgent.js';
import { RuntimeEventBus } from '../../console/RuntimeEventBus.js';

// ─────────────────────────────────────────────────────────────────────────────
// AgentRouter — Deterministic intent-to-agent dispatcher.
//
// GOVERNANCE RULES:
//  - Routing is DETERMINISTIC (no LLM involved in routing decisions).
//  - One intent maps to exactly one agent.
//  - Unknown intents return an unrouted status (fallback to Karen's pipeline).
//  - All agent executions are observable via RuntimeEventBus.
//
// Routing Table:
//  list_tasks, query_calendar          → CalendarAgent
//  create_calendar_event               → CalendarAgent
//  update_calendar_event               → CalendarAgent
//  delete_calendar_event               → CalendarAgent
//  find_calendar_event                 → CalendarAgent
//  (future) send_message               → MessagingAgent
//  (future) organize_task              → TaskAgent
// ─────────────────────────────────────────────────────────────────────────────

export type RouterResult =
  | { routed: true; result: AgentExecutionResult }
  | { routed: false; reason: string };

export class AgentRouter {
  private routingTable: Map<string, IAgent>;

  constructor(private calendarAgent: CalendarAgent) {
    this.routingTable = new Map([
      ['list_tasks', calendarAgent],
      ['query_calendar', calendarAgent],
      ['create_calendar_event', calendarAgent],
      ['update_calendar_event', calendarAgent],
      ['delete_calendar_event', calendarAgent],
      ['find_calendar_event', calendarAgent],
    ]);
  }

  public canRoute(intent: string): boolean {
    return this.routingTable.has(intent.toLowerCase());
  }

  public async route(intent: string, context: AgentContext): Promise<RouterResult> {
    const normalizedIntent = intent.toLowerCase();
    const agent = this.routingTable.get(normalizedIntent);

    if (!agent) {
      RuntimeEventBus.log('AGENT_ROUTER', 'SYSTEM',
        `No agent registered for intent: ${intent}. Falling through to Karen pipeline.`,
        context.traceId
      );
      return { routed: false, reason: `No agent handles intent: ${intent}` };
    }

    RuntimeEventBus.log('AGENT_ROUTER', 'SYSTEM',
      `Routing intent "${intent}" → ${agent.name}`,
      context.traceId
    );

    const result = await agent.execute({ ...context, intent: normalizedIntent });

    return { routed: true, result };
  }
}

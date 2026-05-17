import { randomUUID } from 'crypto';

export enum OverrideAction {
  INTEGRATIONS_PAUSED = 'INTEGRATIONS_PAUSED',
  INTEGRATIONS_RESUMED = 'INTEGRATIONS_RESUMED',
  PROACTIVE_MODE_PAUSED = 'PROACTIVE_MODE_PAUSED',
  PROACTIVE_MODE_RESUMED = 'PROACTIVE_MODE_RESUMED',
  AI_PROPOSALS_DISABLED = 'AI_PROPOSALS_DISABLED',
  AI_PROPOSALS_ENABLED = 'AI_PROPOSALS_ENABLED',
  ESCALATION_PAUSED = 'ESCALATION_PAUSED',
  REPLAY_APPROVED = 'REPLAY_APPROVED'
}

export interface HumanOverrideAuditRecord {
  auditId: string;
  action: OverrideAction;
  performedBy: string;
  reason: string;
  timestamp: string;
  // Immutable — stored as-is, never updated
}

export class HumanOverrideAuditLogger {
  private records: HumanOverrideAuditRecord[] = [];

  log(action: OverrideAction, performedBy: string, reason: string): HumanOverrideAuditRecord {
    const record: HumanOverrideAuditRecord = {
      auditId: randomUUID(),
      action,
      performedBy,
      reason,
      timestamp: new Date().toISOString()
    };
    // In production: persist to audit_events collection in Mongo (append-only)
    this.records.push(record);
    console.log(JSON.stringify({ type: 'HUMAN_OVERRIDE_AUDIT', ...record }));
    return record;
  }

  getHistory(): HumanOverrideAuditRecord[] {
    return [...this.records]; // Return copy — records are immutable
  }
}

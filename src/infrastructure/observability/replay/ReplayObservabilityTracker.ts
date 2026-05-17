import { randomUUID } from 'crypto';

export interface ReplaySessionRecord {
  sessionId: string;
  startedAt: string;
  completedAt?: string;
  totalEventsReplayed: number;
  sideEffectsSuppressed: number;
  divergenceDetected: boolean;
  divergenceDetails?: string;
  latencyMs?: number;
}

export class ReplayObservabilityTracker {
  private sessions: Map<string, ReplaySessionRecord> = new Map();

  startSession(): string {
    const sessionId = randomUUID();
    const record: ReplaySessionRecord = {
      sessionId,
      startedAt: new Date().toISOString(),
      totalEventsReplayed: 0,
      sideEffectsSuppressed: 0,
      divergenceDetected: false
    };
    this.sessions.set(sessionId, record);
    console.log(JSON.stringify({ type: 'REPLAY_SESSION_STARTED', sessionId }));
    return sessionId;
  }

  recordEventReplayed(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.totalEventsReplayed++;
  }

  recordSideEffectSuppressed(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.sideEffectsSuppressed++;
  }

  recordDivergence(sessionId: string, details: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.divergenceDetected = true;
      session.divergenceDetails = details;
      console.log(JSON.stringify({ type: 'REPLAY_DIVERGENCE_DETECTED', sessionId, details }));
    }
  }

  completeSession(sessionId: string): ReplaySessionRecord | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.completedAt = new Date().toISOString();
    console.log(JSON.stringify({ type: 'REPLAY_SESSION_COMPLETED', ...session }));
    return session;
  }
}

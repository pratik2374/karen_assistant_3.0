export interface MessageEnvelope<TPayload> {
  // Envelope Metadata
  messageId: string;
  eventId: string;
  schemaVersion: number;
  
  // Provenance & Tracing
  traceId: string;
  correlationId: string;
  causationId?: string;

  // Aggregate Info
  aggregateId: string;
  aggregateType: string;
  aggregateVersion: number;

  // Delivery & Reliability
  retryCount: number;
  issuedAt: Date;
  
  // Replay Safety Rules
  replayed: boolean;
  replaySafe: boolean;
  sideEffectFree: boolean;

  // Payload
  payload: TPayload;
}

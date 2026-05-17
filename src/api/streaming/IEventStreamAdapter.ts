// Streaming & Realtime preparation.
// Allows future websocket or SSE adapters to plug in without modifying controllers.
export interface IEventStreamAdapter {
  broadcast(event: StreamEvent): Promise<void>;
  subscribeClient(clientId: string, topics: string[]): void;
  removeClient(clientId: string): void;
}

export interface StreamEvent {
  topic: string;
  payload: any;
  traceId: string;
  correlationId: string;
  timestamp: string;
}

// NoOp implementation for MVP — swap for Socket.io adapter in realtime phase
export class NoOpEventStreamAdapter implements IEventStreamAdapter {
  async broadcast(_event: StreamEvent): Promise<void> { /* no-op */ }
  subscribeClient(_clientId: string, _topics: string[]): void { /* no-op */ }
  removeClient(_clientId: string): void { /* no-op */ }
}

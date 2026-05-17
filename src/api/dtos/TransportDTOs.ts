import { z } from 'zod';

export type ExecutionMode = 'PRODUCTION' | 'SANDBOX' | 'REPLAY' | 'DRY_RUN';
// Execution Mode is propagated from the transport edge through the entire lifecycle.
export const ExecutionModeHeader = 'x-karen-execution-mode';

// Inbound DTOs — raw transport shapes, never domain objects
export const CreateTaskRequestDTO = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  dueAt: z.string().datetime(),
  timezone: z.string(),
  idempotencyKey: z.string().uuid()
});
export type CreateTaskRequestDTO = z.infer<typeof CreateTaskRequestDTO>;

export const CreateReminderRequestDTO = z.object({
  taskId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  timezone: z.string(),
  message: z.string().max(500),
  idempotencyKey: z.string().uuid()
});
export type CreateReminderRequestDTO = z.infer<typeof CreateReminderRequestDTO>;

// Outbound DTOs — safe, stripped representations for HTTP responses
export interface TaskResponseDTO {
  taskId: string;
  state: string;
  priority: string;
  acceptedAt: string;
  correlationId: string;
}

export interface AsyncCommandResponseDTO {
  status: 'ACCEPTED' | 'QUEUED';
  correlationId: string;
  traceId: string;
  message: string;
}

// Identity abstraction — future auth expansion without changing controllers
export interface IRequestIdentity {
  userId: string;
  sessionId: string;
  scopes: string[];
  deviceId?: string;
  executionMode: ExecutionMode;
}

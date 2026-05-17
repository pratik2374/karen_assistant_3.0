import { Request, Response } from 'express';
import { CreateTaskRequestDTO, AsyncCommandResponseDTO } from '../../dtos/TransportDTOs';
import { HttpErrorMapper } from '../../errors/HttpErrorMapper';
import { randomUUID } from 'crypto';

// Controller is INTENTIONALLY thin — no domain logic, no repository access.
// Receives validated DTO → maps to Command → dispatches to Application Layer → returns 202 ACCEPTED.
export class TaskController {

  async createTask(req: Request, res: Response): Promise<void> {
    try {
      const dto = req.body as CreateTaskRequestDTO;
      const { correlationId, traceId, identity } = req;

      // Dispatch to Application Layer (Command Handler injected via Composition Root)
      // Placeholder: in production this calls TaskCommandHandler.handle(command)
      const commandId = randomUUID();
      console.log(JSON.stringify({
        type: 'COMMAND_DISPATCHED',
        commandId,
        actionType: 'CREATE_TASK',
        correlationId,
        traceId,
        executionMode: identity.executionMode,
        payload: { title: dto.title, priority: dto.priority }
      }));

      const response: AsyncCommandResponseDTO = {
        status: 'ACCEPTED',
        correlationId,
        traceId,
        message: 'Task creation command accepted and queued for processing'
      };

      // 202 ACCEPTED — async command, never block HTTP on saga completion
      res.status(202).json(response);
    } catch (err) {
      HttpErrorMapper.toResponse(err, res, req.correlationId);
    }
  }
}

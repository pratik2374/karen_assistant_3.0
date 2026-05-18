import { PersistenceModule } from './persistence.module';
import { TaskCommandHandler, CreateTaskCommand, CreateTaskResult } from '../../application/handlers/TaskCommandHandler';
import { CommandExecutionPipeline, ObservabilityStep, ReplayGuardStep } from '../../application/executor/CommandExecutionPipeline';
import { ICommandExecutor, IQueryExecutor } from '../../application/executor/IExecutor';
import { TaskQueryExecutor, GetTaskQuery, TaskReadModel } from '../../application/executor/TaskQueryExecutor';

export interface ApplicationModule {
  taskCommandExecutor: ICommandExecutor<CreateTaskCommand, CreateTaskResult>;
  taskQueryExecutor: IQueryExecutor<GetTaskQuery, TaskReadModel | null>;
}

export function buildApplicationModule(persistence: PersistenceModule): ApplicationModule {
  // 1. Handlers
  const taskCommandHandler = new TaskCommandHandler(
    persistence.taskRepository,
    persistence.outboxStore,
    persistence.buildUnitOfWork
  );

  // 2. Command Execution Pipelines (Middleware)
  const taskCommandExecutor = new CommandExecutionPipeline<CreateTaskCommand, CreateTaskResult>(
    taskCommandHandler,
    [
      new ObservabilityStep(),
      new ReplayGuardStep()
    ]
  );

  // 3. Query Executors
  const taskQueryExecutor = new TaskQueryExecutor(persistence.db);

  console.log('[APPLICATION] Command and Query executors wired with middleware pipelines.');
  return { taskCommandExecutor, taskQueryExecutor };
}

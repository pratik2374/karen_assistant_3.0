import { ApplicationModule } from './application.module';
import { TaskController } from '../../api/v1/controllers/TaskController';
import { WhatsAppWebhookController } from '../../api/v1/controllers/WhatsAppWebhookController';
import { createApp } from '../../api/v1/app';
import express from 'express';

export interface ApiModule {
  app: express.Application;
}

export function buildApiModule(application: ApplicationModule): ApiModule {
  const taskController = new TaskController(application.taskCommandExecutor);
  const webhookController = new WhatsAppWebhookController();

  const app = createApp(taskController, webhookController);

  console.log('[API] Express app wired with controllers.');
  return { app };
}

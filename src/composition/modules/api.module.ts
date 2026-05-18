import { ApplicationModule } from './application.module';
import { MessagingModule } from './messaging.module';
import { AIModule } from './ai.module';
import { TaskController } from '../../api/v1/controllers/TaskController';
import { WhatsAppWebhookController } from '../../api/v1/controllers/WhatsAppWebhookController';
import { WebhookIdempotencyGuard } from '../../api/v1/middleware/idempotency/WebhookIdempotencyGuard';
import { InboundMessagePipeline } from '../../application/conversation/InboundMessagePipeline';
import { ConversationSessionRepository } from '../../domain/conversation/ConversationSession';
import { MessageRenderer } from '../../application/conversation/MessageRenderer';
import { WhatsAppAdapter } from '../../infrastructure/external/whatsapp/WhatsAppAdapter';
import { AIProposalRuntime } from '../../application/ai/runtime/AIProposalRuntime';
import { PromptRegistry } from '../../application/ai/prompts/PromptRegistry';
import { SchemaRegistry } from '../../application/ai/schemas/SchemaRegistry';
import { ClarificationEngine } from '../../application/ai/runtime/ClarificationEngine';
import { HeuristicFallbackEstimator } from '../../infrastructure/ai/governance/HeuristicFallbackEstimator';
import { TokenBudgetManager } from '../../application/ai/governance/TokenBudgetManager';
import { DeterministicContextSanitizer } from '../../infrastructure/ai/security/ContextSanitizer';
import { ContextObservabilityHook } from '../../infrastructure/observability/metrics/ContextObservabilityHook';
import { AIObservabilityHook } from '../../infrastructure/observability/metrics/AIObservabilityHook';
import { ContextEngine } from '../../application/ai/ContextEngine';
import { createApp } from '../../api/v1/app';
import express from 'express';

export interface ApiModule {
  app: express.Application;
}

export function buildApiModule(
  application: ApplicationModule,
  messaging: MessagingModule,
  ai: AIModule
): ApiModule {
  const taskController = new TaskController(application.taskCommandExecutor);

  // Build AI cognition substrate
  const estimator = new HeuristicFallbackEstimator();
  const budgetManager = new TokenBudgetManager(estimator);
  const sanitizer = new DeterministicContextSanitizer();
  const ctxHook = new ContextObservabilityHook();
  const contextEngine = new ContextEngine(budgetManager, sanitizer, ctxHook);
  const promptRegistry = new PromptRegistry();
  const schemaRegistry = new SchemaRegistry();
  const clarificationEngine = new ClarificationEngine();
  const aiHook = new AIObservabilityHook();

  const aiRuntime = new AIProposalRuntime(
    contextEngine,
    promptRegistry,
    schemaRegistry,
    ai.openAIAdapter,
    clarificationEngine,
    aiHook
  );

  // Build transport layer
  const whatsappAdapter = new WhatsAppAdapter(ai.circuitBreaker);
  const sessionRepo = new ConversationSessionRepository();
  const renderer = new MessageRenderer();

  const pipeline = new InboundMessagePipeline(
    aiRuntime,
    sessionRepo,
    renderer,
    whatsappAdapter,
    application.taskCommandExecutor
  );

  const idempotencyGuard = new WebhookIdempotencyGuard(messaging.redis);
  const webhookController = new WhatsAppWebhookController(pipeline);

  const app = createApp(taskController, webhookController, idempotencyGuard);

  console.log('[API] Express app wired with controllers and transport guards.');
  return { app };
}

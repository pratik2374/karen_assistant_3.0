import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { resolveIdentity } from '../middleware/resolveIdentity';
import taskRoutes from './routes/taskRoutes';
import webhookRoutes from './routes/webhookRoutes';

export function createApp(): express.Application {
  const app = express();

  // --- Security Hardening ---
  app.use(helmet());
  app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*' }));
  app.set('trust proxy', 1);

  // Payload size limits — prevent abuse
  app.use(express.json({ limit: '100kb' }));

  // Raw body for webhook signature verification
  app.use('/v1/webhooks', express.raw({ type: 'application/json', limit: '50kb' }));

  // Global rate limit — last-resort abuse protection
  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: { error: 'Global rate limit exceeded', code: 'RATE_LIMITED' }
  }));

  // --- Request Context Propagation ---
  app.use(resolveIdentity);

  // --- Versioned API Routes ---
  app.use('/v1/tasks', taskRoutes);
  app.use('/v1/webhooks', webhookRoutes);

  // Health endpoint — no auth required
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', version: 'v1' });
  });

  return app;
}

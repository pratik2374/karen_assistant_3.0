import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

export class WebhookIdempotencyGuard {
  constructor(private redis: Redis) {}

  public middleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = req.body;
      
      // WhatsApp structure: payload.entry[0].changes[0].value.messages[0].id
      const entry = payload?.entry?.[0];
      const change = entry?.changes?.[0];
      const message = change?.value?.messages?.[0];
      
      if (!message || !message.id) {
        // Not a message payload (e.g. status update), skip idempotency
        return next();
      }

      const messageId = message.id;
      const cacheKey = `wh:idempotency:${messageId}`;

      // SETNX: Set if Not Exists
      // TTL 48 hours = 172800 seconds
      const acquired = await this.redis.set(cacheKey, 'processed', 'EX', 172800, 'NX');

      if (!acquired) {
        console.warn(JSON.stringify({
          type: 'WEBHOOK_DUPLICATE_SUPPRESSED',
          messageId,
          traceId: req.traceId,
          timestamp: new Date().toISOString()
        }));
        
        // WhatsApp requires immediate 200 OK for duplicates to stop retries
        res.status(200).json({ status: 'duplicate_suppressed' });
        return;
      }

      next();
    } catch (error: any) {
      console.error(JSON.stringify({
        type: 'IDEMPOTENCY_GUARD_ERROR',
        error: error.message,
        traceId: req.traceId
      }));
      // On Redis failure, fail open to avoid dropping messages entirely
      next();
    }
  }
}

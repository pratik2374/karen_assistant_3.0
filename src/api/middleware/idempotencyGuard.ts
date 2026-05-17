import { Request, Response, NextFunction } from 'express';

const seenIdempotencyKeys = new Map<string, { status: number; body: any; timestamp: number }>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const idempotencyGuard = (req: Request, res: Response, next: NextFunction): void => {
  const key = req.headers['idempotency-key'] as string;
  if (!key) {
    next();
    return;
  }

  const existing = seenIdempotencyKeys.get(key);
  if (existing && Date.now() - existing.timestamp < TTL_MS) {
    // Return the original response verbatim — idempotent repeat
    res.status(existing.status).json(existing.body);
    return;
  }

  // Intercept the response to cache it
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    seenIdempotencyKeys.set(key, { status: res.statusCode, body, timestamp: Date.now() });
    return originalJson(body);
  };

  next();
};

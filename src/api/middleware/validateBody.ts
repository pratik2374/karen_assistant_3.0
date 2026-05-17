import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny, ZodError } from 'zod';

export const validateBody = (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: 'Request validation failed',
          code: 'VALIDATION_ERROR',
          issues: err.issues.map(i => ({ path: i.path.join('.'), message: i.message }))
        });
        return;
      }
      next(err);
    }
  };

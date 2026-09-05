import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodSchema } from 'zod';

import { ApiError } from './error.js';

// zod `validate()` wiring (docs/05 §5/§8): parse `req.body` against a schema
// before it reaches a handler, so every mutating endpoint gets the same
// "400 with details" behaviour instead of hand-rolling parsing per route.
export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(new ApiError(400, 'Invalid input', 'INVALID_INPUT', parsed.error.flatten()));
      return;
    }
    req.body = parsed.data;
    next();
  };
}

import type { NextFunction, Request, Response } from 'express';

// Stub: real JWT verification is the Auth owner's ticket (docs/05 deferred item 5).
// Until then every request is rejected so protected endpoints fail loudly
// instead of silently working without auth.
export function requireAuth(_req: Request, res: Response, next: NextFunction): void {
  res.status(401).json({ error: 'Authentication not implemented yet', code: 'AUTH_NOT_IMPLEMENTED' });
  next();
}

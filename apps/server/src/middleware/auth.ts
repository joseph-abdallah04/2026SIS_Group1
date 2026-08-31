import type { Request, Response } from 'express';

// Stub: real JWT verification is the Auth owner's ticket (docs/05 deferred item 5).
// Until then every request is rejected so protected endpoints fail loudly
// instead of silently working without auth.
//
// It must NOT call next() — that would send the 401 and then run the route
// handler anyway, so the response is already sent by the time the handler
// writes its own.
export function requireAuth(_req: Request, res: Response): void {
  res.status(401).json({ error: 'Authentication not implemented yet', code: 'AUTH_NOT_IMPLEMENTED' });
}

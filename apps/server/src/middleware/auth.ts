import type { NextFunction, Request, Response } from 'express';

import { verifyToken } from '../modules/auth/jwt.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `requireAuth` once the bearer token verifies. */
    userId?: string;
  }
}

const BEARER_PREFIX = 'Bearer ';

// The bearer header is the only accepted proof of identity. There is
// deliberately no `?token=` fallback for file downloads: a query token is a
// full seven-day credential written into browser history and every access log
// on the way, so the client fetches downloads with the header instead (see
// `api.download` in apps/web/src/lib/api.ts).
//
// Real JWT verification (docs/05 §5 deferred item 5 / docs/06 Auth "Also
// owns"). Checks the `Authorization: Bearer <token>` header against
// `verifyToken`; on success attaches `req.userId` and calls `next()` so
// downstream handlers know who's asking. Never calls next() on failure.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith(BEARER_PREFIX)) {
    res.status(401).json({ error: 'Missing authentication token', code: 'MISSING_TOKEN' });
    return;
  }

  const token = header.slice(BEARER_PREFIX.length);
  const result = verifyToken(token);
  if (!result.ok) {
    const message = result.code === 'TOKEN_EXPIRED' ? 'Token expired' : 'Invalid token';
    res.status(401).json({ error: message, code: result.code });
    return;
  }

  req.userId = result.userId;
  next();
}

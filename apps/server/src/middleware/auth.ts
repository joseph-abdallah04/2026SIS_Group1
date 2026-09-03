import type { NextFunction, Request, Response } from 'express';

import { env } from '../env.js';
import { ApiError } from './error.js';

// Stub: real JWT verification is the Auth owner's ticket (docs/05 deferred item 5).
// Until then every request is rejected so protected endpoints fail loudly
// instead of silently working without auth.
//
// It must NOT call next() on the reject path — that would send the 401 and then run the
// route handler anyway, so the response is already sent by the time the handler
// writes its own.
//
// --- DEV SHIM (assistant owner) ------------------------------------------------------
// One exception: outside production, setting DEV_USER_ID in .env makes every request act
// as that user so the assistant (F33–F37) can be exercised before signup/login exist. Send
// `x-dev-user-id` to impersonate a different seeded user in the same dev server — handy for
// checking that one user's chat and LLM key never leak into another's.
//
// Auth owner: replace the body of `requireAuth` with real JWT verification that sets
// `req.userId`, and delete `resolveDevUserId` plus the DEV_USER_ID entry in env.ts. Nothing
// else needs to change — callers already read `getUserId(req)`.
// -------------------------------------------------------------------------------------

function resolveDevUserId(req: Request): string | null {
  if (env.NODE_ENV === 'production') return null;
  if (!env.DEV_USER_ID) return null;
  const header = req.header('x-dev-user-id');
  return header && header.trim().length > 0 ? header.trim() : env.DEV_USER_ID;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const devUserId = resolveDevUserId(req);
  if (devUserId) {
    req.userId = devUserId;
    next();
    return;
  }

  res
    .status(401)
    .json({ error: 'Authentication not implemented yet', code: 'AUTH_NOT_IMPLEMENTED' });
}

/**
 * The authenticated user's id. Throws rather than returning undefined, so a handler that
 * is accidentally mounted without `requireAuth` fails as a 401 instead of querying with
 * `userId: undefined`.
 */
export function getUserId(req: Request): string {
  if (!req.userId) {
    throw new ApiError(401, 'Not authenticated', 'UNAUTHENTICATED');
  }
  return req.userId;
}

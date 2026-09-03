import { Router, type RequestHandler } from 'express';

import { env } from '../../env.js';
import { requireAuth } from '../../middleware/auth.js';
import { getBoardForSession } from './service.js';

export const pinboardRoutes = Router();

// A session board is member-scoped data, so reading it must require an
// authenticated member of that session (docs/02 §8.3). Neither half exists yet:
// `requireAuth` is still the stub that 401s everything, and membership lives in
// the sessions module. Until both land the endpoint is open in local dev only —
// in production it stays behind the (closed) auth stub rather than serving
// session contents to anyone with a session id.
//
// TODO(F15/auth): replace with `requireAuth` + a membership check via the
// sessions module's public surface, and delete the dev branch.
const DEV_OPEN_BOARD = env.NODE_ENV !== 'production';

const requireBoardAccess: RequestHandler = DEV_OPEN_BOARD
  ? (_req, _res, next) => next()
  : requireAuth;

if (DEV_OPEN_BOARD) {
  console.warn(
    '[pinboard] GET /api/sessions/:id/proposals is unauthenticated (development only)',
  );
}

// docs/06 §6: pinboard owns `/api/sessions/:id/proposals*`; the sessions owner
// owns the rest of `/api/sessions/:id`. Returns the whole board snapshot —
// active question plus its proposals — so one request renders the page.
pinboardRoutes.get<{ sessionId: string }>(
  '/:sessionId/proposals',
  requireBoardAccess,
  async (req, res, next) => {
    try {
      const board = await getBoardForSession(req.params.sessionId);
      res.json(board);
    } catch (err) {
      next(err);
    }
  },
);

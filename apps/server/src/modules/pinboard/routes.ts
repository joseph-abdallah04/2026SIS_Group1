import { Router, type RequestHandler } from 'express';

import { env } from '../../env.js';
import { requireAuth } from '../../middleware/auth.js';
import { getBoardForSession } from './service.js';

export const pinboardRoutes = Router();

// A session board is member-scoped data, so reading it must require an
// authenticated member of that session (docs/02 §8.3). `requireAuth` now does
// real JWT verification (F01/F02), but membership lives in the sessions
// module and doesn't exist yet — so this only checks "some logged-in user",
// not "a member of this session". Until membership lands the endpoint is
// open in local dev only; in production it's behind real auth, but without
// a membership check yet.
//
// TODO(F15/sessions): add a membership check via the sessions module's
// public surface once it exists, and delete the dev branch.
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

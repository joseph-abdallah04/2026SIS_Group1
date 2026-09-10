import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { getShortlistForSession, getVotingStateForSession } from './service.js';
import { assertSessionMember } from './sessionsAdapter.js';

export const votingRoutes = Router();

// Read-only: the live write path is the socket (docs/02 §5). This exists so a
// client that already has the board (REST) and then advances the agenda can
// pick up voting state without waiting for a re-join snapshot.
votingRoutes.get<{ sessionId: string }>(
  '/:sessionId/voting',
  requireAuth,
  async (req, res, next) => {
    try {
      const userId = req.userId!;
      await assertSessionMember(req.params.sessionId, userId);
      const voting = await getVotingStateForSession(req.params.sessionId, userId);
      res.json(voting);
    } catch (err) {
      next(err);
    }
  },
);

votingRoutes.get<{ sessionId: string }>(
  '/:sessionId/shortlist',
  requireAuth,
  async (req, res, next) => {
    try {
      const userId = req.userId!;
      await assertSessionMember(req.params.sessionId, userId);
      const shortlist = await getShortlistForSession(req.params.sessionId);
      res.json(shortlist);
    } catch (err) {
      next(err);
    }
  },
);

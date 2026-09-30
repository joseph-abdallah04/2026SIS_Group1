import { rateLimit } from 'express-rate-limit';
import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import {
  getShortlistForSession,
  getVotingStateForSession,
  listEndedVoteOutcomes,
} from './service.js';
import { assertSessionMember } from './sessionsAdapter.js';

export const votingRoutes = Router();

// One member reviewing an ended board loads this once. Keyed by user, not IP:
// a room behind one campus address must not share a single budget, and the
// deploy sits behind a proxy that would otherwise look like one client.
const outcomesLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again shortly.', code: 'RATE_LIMITED' },
  keyGenerator: (req) => req.userId ?? 'anonymous',
  validate: { keyGeneratorIpFallback: false },
});

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

// Ended sessions only. Members reviewing an old board need each question's
// shortlist and winner, and nothing else this read returns (no ballots, no
// proposal bodies).
votingRoutes.get<{ sessionId: string }>(
  '/:sessionId/outcomes',
  requireAuth,
  outcomesLimiter,
  async (req, res, next) => {
    try {
      await assertSessionMember(req.params.sessionId, req.userId!);
      res.json(await listEndedVoteOutcomes(req.params.sessionId));
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

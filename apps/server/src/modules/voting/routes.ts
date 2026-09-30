import { createHash } from 'node:crypto';

import { Router, type Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

import { requireAuth } from '../../middleware/auth.js';
import {
  getShortlistForSession,
  getVotingStateForSession,
  listEndedVoteOutcomes,
} from './service.js';
import { assertSessionMember } from './sessionsAdapter.js';

export const votingRoutes = Router();

// Has to run before `requireAuth`. A member is identified by their token, so a
// shared campus address does not share one budget. Requests with no token share
// an address bucket instead of one bucket per forged header.
function outcomesClientKey(req: Request): string {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ') && header.length > 'Bearer '.length) {
    return createHash('sha256').update(header).digest('hex');
  }
  const ip = req.ip;
  return ip ? `anon:${ipKeyGenerator(ip)}` : 'anon';
}

const outcomesLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again shortly.', code: 'RATE_LIMITED' },
  keyGenerator: outcomesClientKey,
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
  outcomesLimiter,
  requireAuth,
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

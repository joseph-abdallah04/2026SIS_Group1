import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { getSessionSummary } from './service.js';

export const summaryRoutes = Router();

summaryRoutes.get<{ sessionId: string }>(
  '/:sessionId/summary',
  requireAuth,
  async (req, res, next) => {
    try {
      const summary = await getSessionSummary(req.params.sessionId, req.userId!);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },
);

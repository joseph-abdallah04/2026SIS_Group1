import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { getSessionSummary, getSessionSummaryPdf } from './service.js';

export const summaryRoutes = Router();

summaryRoutes.get<{ sessionId: string }>(
  '/:sessionId/summary.pdf',
  requireAuth,
  async (req, res, next) => {
    try {
      const { pdf, filename } = await getSessionSummaryPdf(req.params.sessionId, req.userId!);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(pdf);
    } catch (err) {
      next(err);
    }
  },
);

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

import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { getSessionSummary, getSessionSummaryPdf } from './service.js';

export const summaryRoutes = Router();

summaryRoutes.get<{ sessionId: string }>(
  '/:sessionId/summary.pdf',
  requireAuth,
  async (req, res, next) => {
    try {
      // The viewer's IANA zone, so the file's times match the page's. Checked
      // in the PDF (`recapTimeZone`), which falls back to UTC.
      const tz = typeof req.query.tz === 'string' ? req.query.tz : undefined;
      const { pdf, filename } = await getSessionSummaryPdf(
        req.params.sessionId,
        req.userId!,
        tz ? { timeZone: tz } : {},
      );
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

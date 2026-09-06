import { Router } from 'express';
import { updateShortlist } from './shortlist.service.js';
import { requireLeader } from '../../middleware/requireLeader.js';

export const votingRoutes = Router();

votingRoutes.post<{ sessionId: string }>(
  '/:sessionId/shortlist',
  requireLeader,
  async (req, res, next) => {
    try {
      const sessionId = req.params.sessionId;
      const { proposalIds } = req.body;

      if (!Array.isArray(proposalIds)) {
        return res.status(400).json({ error: 'proposalIds must be an array' });
      }

      const updated = await updateShortlist(sessionId, proposalIds);

      // Realtime broadcast happens in gateway (see next section)
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);
import { Router } from 'express';
import { updateShortlist } from './shortlist.service.js';
import { requireLeader } from '../../middleware/requireLeader.js';
import { io } from '../../realtime/index.js';
import { sessionRoom } from '../../realtime/types.js';

export const votingRoutes = Router();

votingRoutes.post('/:sessionId/shortlist', requireLeader, async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId;
    const { proposalIds } = req.body;

    if (!Array.isArray(proposalIds)) {
      return res.status(400).json({ error: 'proposalIds must be an array' });
    }

    const updated = await updateShortlist(sessionId, proposalIds);

    io.to(sessionRoom(sessionId)).emit('shortlist_updated', updated);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});
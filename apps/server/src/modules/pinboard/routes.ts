import { Router } from 'express';

import { getBoardForSession } from './service.js';

export const pinboardRoutes = Router();

pinboardRoutes.get('/:sessionId/board', async (req, res, next) => {
  try {
    const board = await getBoardForSession(req.params.sessionId);
    res.json(board);
  } catch (err) {
    next(err);
  }
});

import type { RequestHandler } from 'express';
import { prisma } from '../db.js';
import { ApiError } from './error.js';

export const requireLeader: RequestHandler = async (req, _res, next) => {
  try {
    const sessionId = req.params.sessionId;

    // req.get() returns string | undefined (never string[])
    const userId = req.get('x-rt-dev-user-id');

    if (!userId) {
      throw new ApiError(401, 'Missing user identity', 'NOT_AUTHENTICATED');
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { leaderId: true },
    });

    if (!session) {
      throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
    }

    if (session.leaderId !== userId) {
      throw new ApiError(403, 'Only the session leader can perform this action', 'NOT_LEADER');
    }

    next();
  } catch (err) {
    next(err);
  }
};
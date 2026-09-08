import { Router } from 'express';
import { updateProfileSchema } from '@roundtable/shared/schemas';

import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { updateDisplayName } from './service.js';

export const usersRoutes = Router();

// docs/06 §6: Auth owns `/api/users/me/*` too (separate prefix from
// `/api/auth/*`), per its documented API surface: PATCH /api/users/me ->
// { displayName } -> User (bare User, not wrapped — unlike GET /api/auth/me).
usersRoutes.patch('/me', requireAuth, validateBody(updateProfileSchema), async (req, res, next) => {
  try {
    const user = await updateDisplayName(req.userId!, req.body.displayName);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
});

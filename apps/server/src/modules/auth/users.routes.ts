import { Router } from 'express';
import { deleteAccountSchema, updateProfileSchema } from '@roundtable/shared/schemas';

import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { deleteAccount, updateDisplayName } from './service.js';

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

// F33: DELETE /api/users/me — same "never trust a client-supplied id"
// pattern as every other route here, `req.userId` only, never a param/body
// id. The password is re-checked in `deleteAccount` itself, not here — this
// is just wiring, no auth logic belongs at the route layer.
usersRoutes.delete('/me', requireAuth, validateBody(deleteAccountSchema), async (req, res, next) => {
  try {
    await deleteAccount(req.userId!, req.body.password);
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

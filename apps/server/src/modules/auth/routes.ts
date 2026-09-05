import { Router } from 'express';
import { loginSchema, signupSchema } from '@roundtable/shared/schemas';

import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { login, signup } from './service.js';

export const authRoutes = Router();

// docs/06 §6: auth owns `/api/auth/*`. `signupSchema` validates the body
// (email, password, displayName) before `signup()` ever sees it.
authRoutes.post('/signup', validateBody(signupSchema), async (req, res, next) => {
  try {
    const result = await signup(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

authRoutes.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await login(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// Stateless JWTs — nothing to revoke server-side in this MVP. This exists so
// there's a real endpoint to call (and a live route for `requireAuth` to run
// on, beyond its unit tests); the actual "log out" effect is the client
// deleting its token.
authRoutes.post('/logout', requireAuth, (_req, res) => {
  res.status(200).json({ ok: true });
});

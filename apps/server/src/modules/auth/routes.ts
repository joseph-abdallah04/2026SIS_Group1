import { Router } from 'express';
import {
  loginSchema,
  resendVerificationSchema,
  signupSchema,
  verifyEmailQuerySchema,
} from '@roundtable/shared/schemas';

import { requireAuth } from '../../middleware/auth.js';
import { ApiError } from '../../middleware/error.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { getUserById, login, resendVerification, signup, verifyEmail } from './service.js';

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

// Public — the token in the query string *is* the credential (docs/06 §6:
// this is auth's own /api/auth/* namespace, no requireAuth involved).
authRoutes.get('/verify-email', validateQuery(verifyEmailQuerySchema), async (req, res, next) => {
  try {
    const result = await verifyEmail(req.query.token as string);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// Also public and deliberately not behind requireAuth: an unverified account
// has no working session to authenticate with (that's the whole point of
// this ticket), so this can only be reached by email address.
authRoutes.post(
  '/resend-verification',
  validateBody(resendVerificationSchema),
  async (req, res, next) => {
    try {
      await resendVerification(req.body.email);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// Stateless JWTs — nothing to revoke server-side in this MVP. This exists so
// there's a real endpoint to call (and a live route for `requireAuth` to run
// on, beyond its unit tests); the actual "log out" effect is the client
// deleting its token.
authRoutes.post('/logout', requireAuth, (_req, res) => {
  res.status(200).json({ ok: true });
});

// docs/06 API surface: GET /api/auth/me -> { user: User }
authRoutes.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await getUserById(req.userId!);
    if (!user) {
      throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    }
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
});

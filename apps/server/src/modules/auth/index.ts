// Public surface of the auth module (docs/02 §2). Everything else in this
// folder is private — other modules import from here, never from a file
// inside. `requireAuth` itself lives in `../../middleware/auth.ts` (it's
// cross-cutting Express glue, consumed the same way `error.ts` is).
export { authRoutes } from './routes.js';

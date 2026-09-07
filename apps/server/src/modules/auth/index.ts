// Public surface of the auth module (docs/02 §2). Everything else in this
// folder is private — other modules import from here, never from a file
// inside. `requireAuth` itself lives in `../../middleware/auth.ts` (it's
// cross-cutting Express glue, consumed the same way `error.ts` is).
export { authRoutes } from './routes.js';
// The realtime gateway verifies the handshake token itself: Socket.IO's
// handshake carries no headers, so `requireAuth` (which reads
// `Authorization`) cannot cover it, and a socket must still not join a room
// on a client's word alone.
export { verifyToken } from './jwt.js';
export type { VerifyResult } from './jwt.js';

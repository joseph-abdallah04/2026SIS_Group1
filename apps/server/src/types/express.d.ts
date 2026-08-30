// Request augmentation shared by every module.
//
// `requireAuth` populates `req.userId` once it has verified the caller. Handlers should
// read it through `getUserId(req)` (src/middleware/auth.ts) rather than touching the
// optional field directly, so an unauthenticated request fails loudly instead of
// silently acting as `undefined`.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};

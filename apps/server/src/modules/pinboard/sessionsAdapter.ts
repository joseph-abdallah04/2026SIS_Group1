// The `sessions` module now exists — this file used to stand in for its
// public surface (docs/02 §2 permits exactly one file per module to do that
// while the real module doesn't exist yet). Collapsed to a re-export, which is
// exactly what the stand-in's header said it would become; no other file in
// `pinboard/` changes, and `QuestionRef`/`SessionRef` are re-exported because
// `permissions.ts` types against them.
export type { QuestionRef, SessionRef } from '../sessions/index.js';
export { getActiveQuestion, getQuestion, getSession } from '../sessions/index.js';

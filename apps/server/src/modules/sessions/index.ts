// Public surface of the sessions module (docs/02 §2). Everything else in this
// folder is private — other modules (Pinboard, etc.) import from here, never
// from a file inside.
export { createSessionsRoutes } from './routes.js';
export {
  createSession,
  deleteSession,
  emitSessionStarted,
  generateSessionCode,
  getActiveQuestion,
  getQuestion,
  getSession,
  getSessionMemberIdentity,
  getSessionWithQuestions,
  joinSessionByCode,
  leaveSession,
  listSessionMembers,
  listSessionsForUser,
  openSessionForJoining,
  resolveSessionByCode,
  startSession,
  updateSessionDraft,
} from './service.js';
export type {
  QuestionRef,
  SessionMemberIdentity,
  SessionMemberRow,
  SessionPreview,
  SessionRef,
} from './service.js';

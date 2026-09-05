// Public surface of the sessions module (docs/02 §2). Everything else in this
// folder is private — other modules (Pinboard, etc.) import from here, never
// from a file inside.
export { sessionsRoutes } from './routes.js';
export {
  assertSessionMember,
  createSession,
  generateSessionCode,
  getActiveQuestion,
  getQuestion,
  getSession,
  getSessionMemberIdentity,
  getSessionWithQuestions,
  joinSessionByCode,
  listSessionMembers,
  listSessionsForUser,
  openSessionForJoining,
  resolveSessionByCode,
} from './service.js';
export type {
  QuestionRef,
  SessionMemberIdentity,
  SessionMemberRow,
  SessionPreview,
  SessionRef,
} from './service.js';

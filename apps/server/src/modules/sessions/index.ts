// Public surface of the sessions module (docs/02 §2). Everything else in this
// folder is private — other modules (Pinboard, etc.) import from here, never
// from a file inside.
export { createSessionsRoutes } from './routes.js';
export {
  assertSessionMember,
  addSessionQuestion,
  createSession,
  deleteDraftSessionsForUser,
  deleteSession,
  emitQuestionAdded,
  emitQuestionFocus,
  emitQuestionPhase,
  emitSessionEnded,
  emitSessionStarted,
  endSession,
  generateSessionCode,
  getActiveQuestion,
  getDiscussionTimer,
  getQuestion,
  getSession,
  getSessionMemberIdentity,
  getSessionWithQuestions,
  findLiveSessionForUser,
  focusQuestion,
  joinSessionByCode,
  leaveSession,
  listSessionMembers,
  listSessionParticipants,
  listSessionsForUser,
  openSessionForJoining,
  resolveSessionByCode,
  setQuestionPhase,
  startSession,
  updateSessionDraft,
} from './service.js';
export type {
  LiveSessionRef,
  QuestionRef,
  SessionMemberIdentity,
  SessionMemberRow,
  SessionPreview,
  SessionRef,
} from './service.js';

// The `sessions` module's public surface (docs/02 §2). Voting reads session
// and question state through here, never the tables themselves. Sessions must
// not import this module — closing a round calls into sessions, not the reverse.
export {
  assertSessionMember,
  emitQuestionPhase,
  getActiveQuestion,
  getQuestion,
  getSession,
  getSessionWithQuestions,
  listSessionMembers,
  setQuestionPhase,
} from '../sessions/index.js';
export type { QuestionRef, SessionRef } from '../sessions/index.js';

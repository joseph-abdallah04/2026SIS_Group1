// Public surface of the sessions module (docs/02 §2). Everything else in this
// folder is private — other modules (Pinboard, etc.) import from here, never
// from a file inside.
export { sessionsRoutes } from './routes.js';
export {
  createSession,
  getActiveQuestion,
  getQuestion,
  getSession,
  getSessionWithQuestions,
  listSessionsForUser,
} from './service.js';
export type { QuestionRef, SessionRef } from './service.js';

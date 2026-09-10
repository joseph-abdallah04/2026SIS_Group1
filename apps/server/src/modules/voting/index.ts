// Public surface of the voting module (docs/02 §2). Everything else in this
// folder is private — other modules import from here, never from a file inside.
export { votingRoutes } from './routes.js';
export { registerVotingSocketHandlers } from './socket.js';
export { getSessionVoteOutcomes, getShortlistState, getVotingState } from './service.js';
export type { QuestionVoteOutcome } from './service.js';

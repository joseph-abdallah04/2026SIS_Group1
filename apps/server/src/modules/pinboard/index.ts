// Public surface of the pinboard module (docs/02 §2). Everything else in this
// folder is private — other modules import from here, never from a file inside.
export { pinboardRoutes } from './routes.js';
// `createProposal` is the single write path docs/02 §8.8 requires: the tool
// editors (F19–F21) reach it over the socket, and propose-from-chat (F37)
// calls it directly, then broadcasts with `emitProposalCreated`.
export { createProposal, getBoardForSession, listProposals } from './service.js';
export { registerPinboardSocketHandlers, emitProposalCreated } from './socket.js';

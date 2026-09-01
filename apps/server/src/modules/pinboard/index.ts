// Public surface of the pinboard module (docs/02 §2). Everything else in this
// folder is private — other modules import from here, never from a file inside.
export { pinboardRoutes } from './routes.js';
export { getBoardForSession, listProposals } from './service.js';
export { registerPinboardSocketHandlers, emitProposalCreated } from './socket.js';

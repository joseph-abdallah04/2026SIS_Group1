// Public surface of the pinboard module (docs/02 §2). Everything else in this
// folder is private — other modules import from here, never from a file inside.
export { pinboardRoutes } from './routes.js';
// The write paths docs/02 §8.8 requires: the tool editors (F19–F21) reach them
// over the socket, propose-from-chat (F37) calls them directly, and each pairs
// with the emitter that tells the room what happened.
export {
  createProposal,
  deleteProposal,
  getBoardForSession,
  listProposals,
  updateProposal,
} from './service.js';
export {
  registerPinboardSocketHandlers,
  emitProposalCreated,
  emitProposalDeleted,
  emitProposalUpdated,
} from './socket.js';

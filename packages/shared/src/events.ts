// Socket.IO event contracts — the single source of truth for realtime types.
// Server: `new Server<ClientToServerEvents, ServerToClientEvents>(...)`
// Client: `io<ServerToClientEvents, ClientToServerEvents>(...)`
// Module owners extend these maps in their PRs. See docs/02-architecture.md §4.

import type { BoardItem, BoardResponse, SessionStatus } from './index.js';
import type { ProposalCreateInput } from './schemas.js';

export interface SessionUserPayload {
  id: string;
  displayName: string;
}

/** Result of a write intent: the fact itself arrives on the broadcast, not here. */
export interface WriteAck {
  ok: boolean;
  error?: string;
  code?: string;
}

/**
 * Everything a client needs to render a session from cold (docs/02 §4 — "full
 * snapshot"). It must stay a superset of `BoardResponse`: a reconnecting client
 * resyncs from this alone, so anything missing here is something the header
 * would render as a placeholder until a REST call happened to fill it in.
 *
 * F08 adds the first sessions-owned fields: `status`/`leaderId` (so the
 * waiting room and pinboard don't need a separate REST call just to know
 * whose session this is) and `participants` — who is *connected right now*,
 * derived from socket rooms, not `session_members` (docs/02 §4: presence is
 * in-memory, membership history is persisted). Vote progress etc. get added
 * here as those modules land.
 */
export interface SessionStatePayload extends Omit<BoardResponse, 'items'> {
  proposals: BoardItem[];
  status: SessionStatus;
  leaderId: string;
  participants: SessionUserPayload[];
}

export interface ClientToServerEvents {
  /** Join a session room; server validates membership then acks with ok/error. */
  memberJoin(payload: { sessionId: string }, ack?: (res: { ok: boolean; error?: string }) => void): void;

  // === sessions module ===

  // === pinboard module ===
  /**
   * Propose an item onto the board of the session this socket has already
   * joined (docs/06 Pinboard §Socket events). The target session, its active
   * question and the author are all taken from the server's view of the socket
   * — never from this payload — so a client can neither write to a board it has
   * not joined nor forge authorship.
   *
   * Sent by the tool editors (F19–F21) and propose-from-chat (F37); this module
   * validates, persists, then broadcasts `proposalCreated` to the room.
   */
  proposalCreate(payload: ProposalCreateInput, ack?: (res: WriteAck) => void): void;
  // `proposalUpdate` / `proposalDelete` arrive with F16 (author CRUD).

  // === voting module ===
  // === summary module ===
  // === voice module ===
  // === assistant module ===
}

export interface ServerToClientEvents {
  /** Presence update when a member joins the session room. */
  memberJoined(payload: { user: SessionUserPayload }): void;
  memberLeft(payload: { user: SessionUserPayload }): void;
  /** Full state snapshot sent on join/reconnect so refreshed clients resync (docs/02 §4). */
  sessionState(payload: SessionStatePayload): void;

  // === sessions module ===

  // === pinboard module ===
  /**
   * A proposal became part of the board (F15). Broadcast to the whole
   * `session:{id}` room including the author, so every client — proposer
   * included — renders the same server-authored row.
   */
  proposalCreated(payload: { proposal: BoardItem }): void;
  proposalUpdated(payload: { proposal: BoardItem }): void;
  proposalDeleted(payload: { proposalId: string; questionId: string }): void;

  // === voting module ===
  // === summary module ===
  // === voice module ===
  // === assistant module ===
}

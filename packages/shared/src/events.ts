// Socket.IO event contracts — the single source of truth for realtime types.
// Server: `new Server<ClientToServerEvents, ServerToClientEvents>(...)`
// Client: `io<ServerToClientEvents, ClientToServerEvents>(...)`
// Module owners extend these maps in their PRs. See docs/02-architecture.md §4.

import type { BoardItem } from './index.js';
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

export interface SessionStatePayload {
  sessionId: string;
  questionId: string | null;
  proposals: BoardItem[];
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

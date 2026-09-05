// Socket.IO event contracts — the single source of truth for realtime types.
// Server: `new Server<ClientToServerEvents, ServerToClientEvents>(...)`
// Client: `io<ServerToClientEvents, ClientToServerEvents>(...)`
// Module owners extend these maps in their PRs. See docs/02-architecture.md §4.

import type { BoardItem, BoardResponse } from './index.js';
import type { ProposalCreateInput, ProposalDeleteInput, ProposalUpdateInput } from './schemas.js';

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
 * Sessions-owned fields (phase, presence, vote progress) get added here as
 * those modules land.
 */
export interface SessionStatePayload extends Omit<BoardResponse, 'items'> {
  proposals: BoardItem[];
  /**
   * Who the server believes this socket is. The client renders author-only
   * affordances from this rather than from a locally remembered id, so what the
   * UI offers and what the server will accept come from one source (F16).
   *
   * Not part of `BoardResponse`: the REST read has no identity attached, and a
   * client that only ever managed a REST load cannot write anyway.
   */
  viewer: SessionUserPayload;
}

export interface ClientToServerEvents {
  /** Join a session room; server validates membership then acks with ok/error. */
  memberJoin(
    payload: { sessionId: string },
    ack?: (res: { ok: boolean; error?: string }) => void,
  ): void;

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
  /**
   * Edit or move a proposal you authored (F16). The server re-checks authorship
   * against the socket's user, so hiding the affordance in the UI is a courtesy
   * and this is the enforcement.
   */
  proposalUpdate(payload: ProposalUpdateInput, ack?: (res: WriteAck) => void): void;
  /**
   * Remove a proposal you authored (F16). Soft-deleted server-side, so a
   * proposal that others extended (F23) keeps its lineage intact.
   * Leader moderation over anyone's proposal is F17.
   */
  proposalDelete(payload: ProposalDeleteInput, ack?: (res: WriteAck) => void): void;
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

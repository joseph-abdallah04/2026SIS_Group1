// Socket.IO event contracts — the single source of truth for realtime types.
// Server: `new Server<ClientToServerEvents, ServerToClientEvents>(...)`
// Client: `io<ServerToClientEvents, ClientToServerEvents>(...)`
// Module owners extend these maps in their PRs. See docs/02-architecture.md §4.

import type { BoardItem, BoardResponse } from './index.js';
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
 * Sessions-owned fields (phase, presence, vote progress) get added here as
 * those modules land.
 */
export interface SessionStatePayload extends Omit<BoardResponse, 'items'> {
  proposals: BoardItem[];
}

export interface ClientToServerEvents {
  /** Join a session room; server validates membership then acks with ok/error. */
  memberJoin(
    payload: { sessionId: string },
    ack?: (res: { ok: boolean; error?: string }) => void
  ): void;

  // === sessions module ===

  // === pinboard module ===
  proposalCreate(
    payload: ProposalCreateInput,
    ack?: (res: WriteAck) => void
  ): void;

  // === voting module ===
  /**
   * Update the shortlist for the session this socket has already joined.
   * Server validates, persists, then broadcasts `shortlist_updated` to the room.
   */
  shortlistUpdated(
    payload: { sessionId: string; proposalIds: string[] },
    ack?: (res: WriteAck) => void
  ): void;

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
  proposalCreated(payload: { proposal: BoardItem }): void;
  proposalUpdated(payload: { proposal: BoardItem }): void;
  proposalDeleted(payload: { proposalId: string; questionId: string }): void;

  // === voting module ===
  /**
   * Broadcast when the shortlist for a session changes.
   * Sent to the entire `session:{id}` room.
   */
  shortlist_updated(payload: { sessionId: string; proposalIds: string[] }): void;

  // === summary module ===
  // === voice module ===
  // === assistant module ===
}
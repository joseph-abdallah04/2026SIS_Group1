// Socket.IO event contracts — the single source of truth for realtime types.
// Server: `new Server<ClientToServerEvents, ServerToClientEvents>(...)`
// Client: `io<ServerToClientEvents, ClientToServerEvents>(...)`
// Module owners extend these maps in their PRs. See docs/02-architecture.md §4.

import type { BoardItem } from './index.js';

export interface SessionUserPayload {
  id: string;
  displayName: string;
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
  // Proposal writes (`proposalCreate` / `proposalUpdate` / `proposalDelete`)
  // arrive with F15 — they need an authenticated socket, which the sessions
  // gateway owns. F14 ships the read side only.

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
  // Emitted by F15; the F14 board already listens so it stays in sync the
  // moment those broadcasts start arriving.
  proposalCreated(payload: { proposal: BoardItem }): void;
  proposalUpdated(payload: { proposal: BoardItem }): void;
  proposalDeleted(payload: { proposalId: string; questionId: string }): void;

  // === voting module ===
  // === summary module ===
  // === voice module ===
  // === assistant module ===
}

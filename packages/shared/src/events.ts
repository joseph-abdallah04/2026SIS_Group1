// Socket.IO event contracts — the single source of truth for realtime types.
// Server: `new Server<ClientToServerEvents, ServerToClientEvents>(...)`
// Client: `io<ServerToClientEvents, ClientToServerEvents>(...)`
// Module owners extend these maps in their PRs. See docs/02-architecture.md §4.

import type { ProposalArtifact } from './artifacts.js';

export interface SessionUserPayload {
  id: string;
  displayName: string;
}

/**
 * Payload for creating a proposal (docs/02 §4, `proposal:create`).
 *
 * PROVISIONAL — added by the assistant owner because F37 ("Propose" from the chat panel)
 * needs a pipeline to send to. The pinboard owner owns this contract: if your
 * implementation needs a different shape, change it here and the assistant will follow.
 */
export interface ProposalCreatePayload {
  sessionId: string;
  questionId: string;
  artifact: ProposalArtifact;
  x: number;
  y: number;
  extendsProposalId?: string;
}

export interface ProposalCreateAck {
  ok: boolean;
  proposalId?: string;
  error?: string;
}

export interface ClientToServerEvents {
  /** Join a session room; server validates membership then acks with ok/error. */
  memberJoin(
    payload: { sessionId: string },
    ack?: (res: { ok: boolean; error?: string }) => void,
  ): void;

  // === sessions module ===
  // === pinboard module ===
  /** Create a proposal on the pinboard. Server validates membership + phase + ownership. */
  proposalCreate(payload: ProposalCreatePayload, ack?: (res: ProposalCreateAck) => void): void;
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
  sessionState(payload: unknown): void;

  // === sessions module ===
  // === pinboard module ===
  // === voting module ===
  // === summary module ===
  // === voice module ===
  // === assistant module ===
}

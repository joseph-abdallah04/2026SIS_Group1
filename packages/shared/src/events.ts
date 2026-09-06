// Socket.IO event contracts — the single source of truth for realtime types.
// Server: new Server<ClientToServerEvents, ServerToClientEvents>(...)
// Client: io<ServerToClientEvents, ClientToServerEvents>(...)

import type { BoardItem, BoardResponse } from './index.js';
import type { ProposalCreateInput } from './schemas.js';

//
// Shared payload types
//

export interface SessionUserPayload {
  id: string;
  displayName: string;
}

export interface WriteAck {
  ok: boolean;
  error?: string;
  code?: string;
}

/**
 * Full session snapshot sent on join/reconnect.
 * Must remain a superset of BoardResponse.
 */
export interface SessionStatePayload extends Omit<BoardResponse, 'items'> {
  proposals: BoardItem[];
  status: string;
  leaderId: string;
  participants: SessionUserPayload[];
  viewer: SessionUserPayload;
  shortlist?: string[];
}

//
// ─────────────────────────────────────────────
//   CLIENT → SERVER EVENTS
// ─────────────────────────────────────────────
//

export interface ClientToServerEvents {
  shortlist_updated(
    payload: { sessionId: string; shortlist: string[] },
    ack?: (res: WriteAck) => void
  ): void;

  shortlist_locked(payload: { sessionId: string }): void;
  voting_started(payload: { sessionId: string }): void;

  memberJoin(payload: { sessionId: string }, ack?: (res: WriteAck) => void): void;
  memberLeave(payload: { sessionId: string }, ack?: (res: WriteAck) => void): void;
  proposalCreate(payload: ProposalCreateInput, ack?: (res: WriteAck) => void): void;
}

//
// SERVER → CLIENT EVENTS
//
export interface ServerToClientEvents {
  shortlist_updated(shortlist: string[]): void;
  shortlist_locked(): void;
  voting_started(): void;

  memberJoined(payload: { user: SessionUserPayload }): void;
  memberLeft(payload: { user: SessionUserPayload }): void;
  sessionState(payload: SessionStatePayload): void;
  sessionFocus(payload: { sessionId: string; questionId: string }): void;
  sessionPhase(payload: { sessionId: string; questionId: string; status: string }): void;
  sessionStarted(payload: { sessionId: string; startedAt?: string }): void;
  sessionEnded(payload: { sessionId: string; endedAt?: string }): void;
  proposalCreated(payload: { proposal: BoardItem }): void;
  proposalUpdated(payload: { proposal: BoardItem }): void;
  proposalDeleted(payload: { proposalId: string; questionId: string }): void;
}

//
// ─────────────────────────────────────────────
//   SERVER → CLIENT EVENTS
// ─────────────────────────────────────────────
//

export interface ServerToClientEvents {
  memberJoined(payload: { user: SessionUserPayload }): void;
  memberLeft(payload: { user: SessionUserPayload }): void;
  sessionState(payload: SessionStatePayload): void;

  sessionFocus(payload: { sessionId: string; questionId: string }): void;

  sessionPhase(payload: {
    sessionId: string;
    questionId: string;
    status: string;
  }): void;

  sessionStarted(payload: {
    sessionId: string;
    startedAt?: string;
  }): void;

  sessionEnded(payload: {
    sessionId: string;
    endedAt?: string;
  }): void;

  proposalCreated(payload: { proposal: BoardItem }): void;
  proposalUpdated(payload: { proposal: BoardItem }): void;
  proposalDeleted(payload: { proposalId: string; questionId: string }): void;

 shortlist_updated(shortlist: string[]): void;

  shortlist_locked(): void;
  voting_started(): void;
}
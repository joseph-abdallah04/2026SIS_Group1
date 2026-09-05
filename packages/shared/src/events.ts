// Socket.IO event contracts — the single source of truth for realtime types.
// Server: `new Server<ClientToServerEvents, ServerToClientEvents>(...)`
// Client: `io<ServerToClientEvents, ClientToServerEvents>(...)`
// Module owners extend these maps in their PRs. See docs/02-architecture.md §4.

import type { BoardItem, BoardResponse, QuestionStatus, SessionStatus } from './index.js';
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
  /**
   * Who the server believes this socket is. The client renders author-only
   * affordances from this rather than from a locally remembered id, so what the
   * UI offers and what the server will accept come from one source (F16).
   * Together with `leaderId` above, one snapshot answers both "is this mine"
   * and "am I the leader" without a REST call.
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
  // `sessionStart` has no client-to-server counterpart — starting is a REST
  // call (`POST /:id/start`), not a socket event, so the leader's click goes
  // through the same 403/idempotency checks REST already enforces. Only the
  // resulting broadcast (`sessionStarted`, below) is a socket event.

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
  /**
   * F09: the leader started the session — broadcast to the whole
   * `session:{id}` room (leader's own socket included, same pattern as
   * `proposalCreated`) so every connected client transitions from the
   * waiting room to the session view at the same moment, no refresh needed.
   * `SessionRouter` re-fetches on receipt and switches on the new `status`
   * itself; this payload only needs to say *that* it happened.
   */
  sessionStarted(payload: { sessionId: string; startedAt: string }): void;
  /**
   * F32: the leader ended the session. Same room broadcast as
   * `sessionStarted`, and deliberately as thin — every client re-fetches and
   * routes itself to the final screen off the new `status`, so this payload
   * does not carry a copy of the session that could arrive stale.
   *
   * There is no client-to-server `sessionEnd`: ending is `POST /:id/end`, for
   * the same reason starting is (docs/02 §5).
   */
  sessionEnded(payload: { sessionId: string; endedAt: string }): void;
  /**
   * F25/F26: the leader moved a question through the agenda. One event covers
   * every transition, skipping included — a skip is `status: 'skipped'`, not a
   * separate `sessionSkipped`, because both are the same state change and two
   * events for it would mean two chances to disagree about the agenda.
   *
   * Thin like its siblings: it names the question that changed and its new
   * status, and clients react by patching that one row and re-reading the
   * board (the active question, and therefore which proposals belong on
   * screen, may have moved with it).
   */
  sessionPhase(payload: { sessionId: string; questionId: string; status: QuestionStatus }): void;

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

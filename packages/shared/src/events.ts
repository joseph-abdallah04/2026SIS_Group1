// Socket.IO event contracts — the single source of truth for realtime types.
// Server: `new Server<ClientToServerEvents, ServerToClientEvents>(...)`
// Client: `io<ServerToClientEvents, ClientToServerEvents>(...)`
// Module owners extend these maps in their PRs. See docs/02-architecture.md §4.

import type {
  BoardItem,
  BoardResponse,
  Question,
  QuestionStatus,
  ReactionGroup,
  SessionStatus,
  VotingPublicState,
  VotingViewerState,
  VotingVoterStatus,
} from './index.js';
import type {
  ProposalCreateInput,
  ProposalDeleteInput,
  ProposalReactInput,
  ProposalUpdateInput,
  EmptyVotingIntent,
  ShortlistToggleInput,
  VoteCastInput,
} from './schemas.js';

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
  // Null if the leader's account has since been deleted.
  leaderId: string | null;
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
  /**
   * F27: the shortlist for the question this snapshot's board is showing.
   * Empty and unlocked until the leader has picked anything; `locked` once
   * they start the vote. Always present so a reconnect does not invent ticks.
   */
  shortlist: string[];
  shortlistLocked: boolean;
  /**
   * F27–F30: personalised voting state for this socket. `myVote` is this
   * viewer's ballot only — the public broadcast (`votingUpdated`) never
   * carries it, so a reconnect is how you learn your own vote after a refresh.
   */
  voting: VotingViewerState;
}

export interface ClientToServerEvents {
  /** Join a session room; server validates membership then acks with ok/error. */
  memberJoin(
    payload: { sessionId: string },
    ack?: (res: { ok: boolean; error?: string }) => void,
  ): void;
  /**
   * Leave a session room without dropping the TCP connection. The waiting
   * room and pinboard emit this on unmount so navigating to the dashboard
   * drops you from "Here now"; a page refresh still uses `disconnect`.
   *
   * No-op (and still `ok`) if this socket is not currently in that room —
   * a Strict Mode remount may join again before the deferred leave fires.
   */
  memberLeave(
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
   * Remove a proposal you authored (F16), or — if you lead the session — any
   * proposal on the board (F17). Soft-deleted server-side, so a proposal that
   * others extended (F23) keeps its lineage intact.
   */
  proposalDelete(payload: ProposalDeleteInput, ack?: (res: WriteAck) => void): void;
  /**
   * Add or take back one emoji reaction on any proposal (F18) — anyone's, your
   * own included. A toggle: the server decides the direction from what is
   * already stored, so pressing twice leaves nothing behind and pressing ten
   * times cannot count ten.
   */
  proposalReact(payload: ProposalReactInput, ack?: (res: WriteAck) => void): void;
  // === voting module ===
  /**
   * Leader adds or removes one proposal on the shortlist (F27). Identity and
   * session come from the socket, same as pinboard writes — the payload is
   * only which card they clicked.
   */
  shortlistToggle(payload: ShortlistToggleInput, ack?: (res: WriteAck) => void): void;
  /** Leader empties the shortlist without starting the vote (F27 cancel). */
  shortlistClear(payload: EmptyVotingIntent, ack?: (res: WriteAck) => void): void;
  /** Leader locks the shortlist and opens the round (F27 confirm). */
  votingStart(payload: EmptyVotingIntent, ack?: (res: WriteAck) => void): void;
  /**
   * Cast or change this member's one vote on the open round (F28). Identity
   * comes from the socket; the payload is only which shortlisted proposal.
   */
  voteCast(payload: VoteCastInput, ack?: (res: WriteAck) => void): void;
  /**
   * Leader closes the open round and writes the answer (F30, manual — the
   * room does not close itself on the last ballot, so people can still change
   * their vote). The overlay stays up on the result until `votingContinue`.
   */
  votingClose(payload: EmptyVotingIntent, ack?: (res: WriteAck) => void): void;
  /** Leader dismisses the in-ballot result and opens the next question. */
  votingContinue(payload: EmptyVotingIntent, ack?: (res: WriteAck) => void): void;
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
  /**
   * The leader pointed the board at a different question without changing
   * that question's status (looking back at an answered pinboard). Clients
   * re-read the board the same way they do for `sessionPhase`.
   */
  sessionFocus(payload: { sessionId: string; questionId: string }): void;
  /**
   * The leader appended a question to a live agenda (`POST /:id/questions`).
   * Clients insert this row — they do not invent one locally after the POST,
   * same rule as `sessionPhase`.
   */
  questionAdded(payload: { sessionId: string; question: Question }): void;

  // === pinboard module ===
  /**
   * A proposal became part of the board (F15). Broadcast to the whole
   * `session:{id}` room including the author, so every client — proposer
   * included — renders the same server-authored row.
   */
  proposalCreated(payload: { proposal: BoardItem }): void;
  proposalUpdated(payload: { proposal: BoardItem }): void;
  proposalDeleted(payload: { proposalId: string; questionId: string }): void;
  /**
   * A proposal's reactions changed (F18).
   *
   * Its own event rather than a `proposalUpdated` carrying the whole row: a
   * reaction is a few bytes, and a drawing's artifact is up to 100KB of SVG and
   * strokes. Reposting all of that because somebody tapped an emoji would make
   * the cheapest interaction on the board the most expensive one to broadcast.
   *
   * The payload is the proposal's entire reaction state, not a delta, so a
   * client that missed an event is corrected by the next one instead of
   * drifting a count further out with every miss.
   */
  proposalReactionsUpdated(payload: {
    proposalId: string;
    questionId: string;
    reactions: ReactionGroup[];
  }): void;

  // === voting module ===
  /**
   * The shortlist for one question changed (F27). Carries the whole list, not
   * a delta, so a client that missed a toggle is corrected by the next one.
   * `locked` is true once the leader has started the vote.
   */
  shortlistUpdated(payload: { questionId: string; proposalIds: string[]; locked: boolean }): void;
  /**
   * Live voting state for the question on screen (F27–F30). Public: tallies
   * and how many people have voted, never who voted for which proposal.
   *
   * Two fields are per-recipient, attached as this event is fanned out socket
   * by socket rather than broadcast to the room:
   *
   * - `voterStatuses` only reaches the leader (F29), so a participant never
   *   receives the nudge list;
   * - `myVote` only ever carries the recipient's own ballot, so the client is
   *   told what the server stored for them instead of assuming its write
   *   landed — and still learns nothing about anyone else's choice.
   *
   * A client that missed an event is corrected by the next one.
   */
  votingUpdated(
    payload: VotingPublicState & {
      voterStatuses?: VotingVoterStatus[];
      myVote?: string | null;
    },
  ): void;
  // === summary module ===
  // === voice module ===
  // === assistant module ===
}

// Shared domain types — concrete, no `any`. See docs/02-architecture.md §3.
// `createdAt` is a fixed-width UTC ISO-8601 string (same convention as
// `BoardItem`) — this is the wire shape sent to clients, not the DB row.
export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

// draft: leader is still setting the session up (F04). lobby: joinable, has a
// code (F06). active: started (F09). ended: over, code released.
export type SessionStatus = 'draft' | 'lobby' | 'active' | 'ended';

export interface Session {
  id: string;
  // null while draft or ended — only lobby/active sessions hold a code.
  code: string | null;
  title: string;
  leaderId: string;
  status: SessionStatus;
  createdAt: Date;
  // Set once, on lobby -> active (F09).
  startedAt: Date | null;
  endedAt: Date | null;
}

/** Row shape for the dashboard's session list (F04/F07). */
export interface SessionSummary {
  id: string;
  code: string | null;
  title: string;
  status: SessionStatus;
  createdAt: Date;
  isLeader: boolean;
  /**
   * Still in the session, as opposed to having taken part and left (F07).
   * `SessionMember` rows survive a leave so history stays intact (docs/02
   * §4), so "is this session mine right now?" needs its own flag.
   */
  isCurrentMember: boolean;
}

// === auth module ===

/** Response shape for endpoints that hand back an authenticated session (F02 login). */
export interface AuthResult {
  token: string;
  user: User;
}

// === sessions module ===

// Per-question progression through discussion → voting → answered, or skipped.
// This is the canonical name/value list (docs/06 Coordination Point 2) —
// import this rather than hand-typing the union; Prisma's QuestionStatus enum
// is kept in sync with it via a compile-time check in apps/server.
export type QuestionStatus = 'pending' | 'discussion' | 'voting' | 'answered' | 'skipped';

export interface Question {
  id: string;
  sessionId: string;
  text: string;
  position: number;
  status: QuestionStatus;
  createdAt: Date;
}

export interface SessionMember {
  sessionId: string;
  userId: string;
  joinedAt: Date;
}

/**
 * Uppercases, drops anything outside the code alphabet (spaces, stray
 * punctuation, a typed-in hyphen), then re-inserts the hyphen after the 4th
 * character. "k7np3wqz", "K7NP 3WQZ" and "K7NP-3WQZ" all normalise to the
 * same string, so the client and server can compare/lookup identically
 * before either validates it against `sessionCodeSchema` (./schemas.ts).
 */
export function normalizeSessionCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^23456789A-HJ-NP-Z]/g, '');
  return cleaned.length <= 4 ? cleaned : `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
}

// === pinboard module ===

export type ProposalType = 'sticky' | 'drawing' | 'diagram';

export type StickyColor = 'yellow' | 'pink' | 'blue' | 'green';

export interface StickyArtifact {
  type: 'sticky';
  text: string;
  color: StickyColor;
}

export interface DrawingArtifact {
  type: 'drawing';
  /** Rendering of the strokes, so a card can be shown without the editor. */
  svg: string;
  /**
   * The editable source. Optional because drawings proposed before strokes
   * were stored have none — those can still be shown, moved and removed, but
   * not reopened, because there is nothing to reopen them from.
   */
  strokes?: DrawingStrokeData[];
}

// The diagram artifact contract (shapes, sizes, palettes, grouping, routing)
// lives in its own module; re-exported here so `@roundtable/shared` is still
// the single import for domain types.
export * from './diagramContract.js';
// v4 studio elements (ink, paths and tables) live beside
// the diagram contract for the same reason: one import for domain types.
export * from './studioElements.js';
// v4.2 standalone arrows: their own collection, because an arrow is drawn
// artwork with free endpoints rather than a semantic node-to-node edge.
export * from './studioArrows.js';
export * from './drawingContract.js';
export * from './reactionContract.js';
import type { DiagramArtifact } from './diagramContract.js';
import type { DrawingStrokeData } from './drawingContract.js';
import type { ReactionGroup } from './reactionContract.js';

export type ArtifactJson = StickyArtifact | DrawingArtifact | DiagramArtifact;

/** API shape for a pinboard item returned by GET /api/sessions/:id/proposals */
export interface BoardItem {
  id: string;
  questionId: string;
  authorId: string;
  authorName: string;
  type: ProposalType;
  artifactJson: ArtifactJson;
  x: number;
  y: number;
  createdAt: string;
  extendsProposalId: string | null;
  /**
   * Emoji reactions left on this proposal (F18), only for emoji somebody has
   * actually used. The card offers the whole fixed set regardless, so an empty
   * list is a card nobody has reacted to yet rather than a card without the
   * row.
   */
  reactions: ReactionGroup[];
}

/**
 * The single order every participant's board uses (F14: "identical boards in
 * identical order") — creation time, then id to break same-millisecond ties.
 *
 * The server sorts with the equivalent Prisma `orderBy`; the client re-applies
 * it when a live event inserts an item into an already-loaded board, so both
 * paths cannot drift. `createdAt` is a fixed-width UTC ISO-8601 string, so
 * lexicographic comparison is chronological.
 */
export function compareBoardItems(a: BoardItem, b: BoardItem): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export interface BoardResponse {
  sessionId: string;
  sessionTitle: string;
  /**
   * The session's leader. Clients compare it against their own id to decide
   * whether to offer the leader's board-tidying affordances; the server checks
   * the same thing again on every write.
   */
  leaderId: string;
  questionId: string | null;
  questionText: string | null;
  questionPosition: number | null;
  questionStatus: QuestionStatus | null;
  items: BoardItem[];
}

// === voting module ===

// === summary module ===

// === voice module ===

/**
 * The LiveKit room a session's audio lives in (docs/06 Voice §Notes).
 *
 * Derived from the session id rather than stored: there is exactly one room per
 * session, and both sides compute the same name, so a room name never has to be
 * passed around or kept in sync. The client is told the name by the token
 * endpoint anyway (the token is only valid for that room), so this exists to
 * keep the two derivations from drifting, not as something the client picks.
 */
export function voiceRoom(sessionId: string): string {
  return `session-${sessionId}`;
}

/** Response body of `POST /api/sessions/:id/livekit-token` (F11). */
export interface VoiceTokenResponse {
  /** Short-lived LiveKit access token, scoped to `roomName` and `identity`. */
  token: string;
  /** LiveKit server URL to connect to (wss://…). Server config, not client config. */
  url: string;
  /** Participant identity the token was minted for — `LocalParticipant.identity`. */
  identity: string;
  /** The room this token is valid for. The client connects to this, never a name of its own. */
  roomName: string;
  /**
   * Lifetime of `token` in seconds. The client refreshes ahead of this rather
   * than parsing the JWT, so the TTL can change server-side without a client
   * release (F11 — "short-lived access token").
   */
  expiresInSeconds: number;
}

// === assistant module ===

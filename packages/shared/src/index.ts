// Shared domain types — concrete, no `any`. See docs/02-architecture.md §3.
export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
}

export type SessionStatus = 'lobby' | 'active' | 'ended';

export interface Session {
  id: string;
  code: string;
  title: string;
  leaderId: string;
  status: SessionStatus;
  createdAt: Date;
  endedAt: Date | null;
}

// === auth module ===

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
  svg: string;
}

export interface DiagramNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface DiagramArtifact {
  type: 'diagram';
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

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

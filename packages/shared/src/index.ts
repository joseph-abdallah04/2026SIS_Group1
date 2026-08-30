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

// === voting module ===

// === summary module ===

// === voice module ===

// === assistant module ===

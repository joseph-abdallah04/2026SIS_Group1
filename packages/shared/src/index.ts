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
}

// === auth module ===

// === sessions module ===

// === pinboard module ===

// Artifact shapes for sticky / drawing / diagram proposals, plus their zod schemas and
// the shared size ceiling. Authored by the assistant owner (F36 needed them first);
// tools + pinboard owners own the contract going forward (docs/06 Coordination Point 3).
export * from './artifacts.js';

// === voting module ===

// === summary module ===

// === voice module ===

// === assistant module ===

// Per-user LLM config (F33), session context (F35), agent tools (F36) and the SSE stream
// event union consumed by the chat panel.
export * from './assistant.js';

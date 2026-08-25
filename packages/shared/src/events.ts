// Socket.IO event contracts. See docs/02-architecture.md §4 for the catalogue.

export interface ClientToServerEvents {
  memberJoin(payload: { sessionId: string }): void;
}

export interface ServerToClientEvents {
  memberJoined(payload: { user: { id: string; displayName: string } }): void;
}

// Placeholder payloads — each module owner extends these in their PRs.

import { useSyncExternalStore } from 'react';
import type { BoardItem } from '@roundtable/shared';

declare global {
  interface Window {
    socket?: any;
  }
}

//
// ─────────────────────────────────────────────────────────────
//   GLOBAL STATE SHAPE
// ─────────────────────────────────────────────────────────────
//

interface SessionState {
  proposals: BoardItem[];
  shortlist: string[];
  viewerId: string | null;
  leaderId: string | null;
  status: string | null;
  shortlistLocked: boolean;
  sessionId: string | null; 
}

//
// ─────────────────────────────────────────────────────────────
//   INTERNAL STORE
// ─────────────────────────────────────────────────────────────
//

let state: SessionState = {
  proposals: [],
  shortlist: [],
  viewerId: null,
  leaderId: null,
  status: null,
  shortlistLocked: false,
  sessionId: null, 
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(partial: Partial<SessionState>) {
  state = { ...state, ...partial };
  emit();
}

//
// ─────────────────────────────────────────────────────────────
//   PUBLIC API
// ─────────────────────────────────────────────────────────────
//

export function sessionStore_getState() {
  return state;
}

export function sessionStore_subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSessionStore<T>(selector: (s: SessionState) => T): T {
  return useSyncExternalStore(
    sessionStore_subscribe,
    () => selector(state)
  );
}

//
// ─────────────────────────────────────────────────────────────
//   REALTIME HANDLER ACTIONS
// ─────────────────────────────────────────────────────────────
//

export function setSessionSnapshot(payload: {
  proposals: BoardItem[];
  shortlist?: string[];
  viewer: { id: string };
  leaderId: string;
  status: string;
  shortlistLocked?: boolean;
  sessionId: string;  
}) {
  setState({
    proposals: payload.proposals,
    shortlist: payload.shortlist ?? [],
    viewerId: payload.viewer.id,
    leaderId: payload.leaderId,
    status: payload.status,
    shortlistLocked: payload.shortlistLocked ?? false,
    sessionId: payload.sessionId, 
  });
}

export function setShortlist(ids: string[]) {
  setState({ shortlist: ids });
}

export function setShortlistLocked(locked: boolean) {
  setState({ shortlistLocked: locked });
}

export function setStatus(status: string) {
  setState({ status });
}

//
// ─────────────────────────────────────────────────────────────
//   UI ACTIONS (Leader interactions)
// ─────────────────────────────────────────────────────────────
//

export function toggleShortlist(id: string) {
  const current = state.shortlist;

  const updated = current.includes(id)
    ? current.filter(x => x !== id)
    : [...current, id];

  // Update local state immediately
  setState({ shortlist: updated });

  if (state.sessionId) {
    window.socket?.emit("shortlist_updated", {
      sessionId: state.sessionId,
      shortlist: updated,
    });
  }
}
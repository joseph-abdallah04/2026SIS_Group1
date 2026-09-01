import { useCallback, useEffect, useRef, useState } from 'react';
import { compareBoardItems, type BoardItem, type BoardResponse } from '@roundtable/shared';
import type { SessionStatePayload } from '@roundtable/shared/events';
import type { ProposalCreateInput } from '@roundtable/shared/schemas';

import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';

/** How long a card that arrived while you were watching stays highlighted (F15). */
const HIGHLIGHT_MS = 2400;

export function usePinboard(sessionId: string) {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [newItemIds, setNewItemIds] = useState<ReadonlySet<string>>(() => new Set());

  // Derived, not stored: whichever source produces a board first ends the load.
  // As state it had to be flipped back to `true` by every refetch, which made a
  // momentary disconnect blank a perfectly good board behind a spinner.
  const loading = board === null && error === null;

  const reload = useCallback(() => {
    setError(null);
    setReloadToken((n) => n + 1);
  }, []);

  const highlightTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const highlight = useCallback((proposalId: string) => {
    setNewItemIds((prev) => new Set(prev).add(proposalId));

    clearTimeout(highlightTimers.current.get(proposalId));
    highlightTimers.current.set(
      proposalId,
      setTimeout(() => {
        highlightTimers.current.delete(proposalId);
        setNewItemIds((prev) => {
          const next = new Set(prev);
          next.delete(proposalId);
          return next;
        });
      }, HIGHLIGHT_MS),
    );
  }, []);

  useEffect(() => {
    const timers = highlightTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  /**
   * Replace the board with the server's join snapshot.
   *
   * This is the resync path (docs/02 §4/§8.6): the server reads the board when
   * the socket joins, so the snapshot already contains anything broadcast while
   * this client was away. It carries the whole board, so nothing here falls
   * back to a placeholder title or a missing question.
   */
  const applySnapshot = useCallback(
    ({ proposals, ...meta }: SessionStatePayload) => {
      if (meta.sessionId !== sessionId) return;
      setError(null);
      setBoard({ ...meta, items: [...proposals].sort(compareBoardItems) });
    },
    [sessionId],
  );

  const upsertItem = useCallback((proposal: BoardItem) => {
    setBoard((prev) => {
      if (!prev || proposal.questionId !== prev.questionId) return prev;
      // Re-sorting with the shared comparator rather than appending is what
      // keeps rapid submissions in the same order everywhere: a client that
      // receives B before A still lands on the server's order (F15).
      const items = prev.items.filter((item) => item.id !== proposal.id);
      items.push(proposal);
      items.sort(compareBoardItems);
      return { ...prev, items };
    });
  }, []);

  const removeItem = useCallback((proposalId: string, questionId: string) => {
    setBoard((prev) => {
      if (!prev || questionId !== prev.questionId) return prev;
      return { ...prev, items: prev.items.filter((item) => item.id !== proposalId) };
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    // First paint, and the only path that works with no socket at all. It never
    // replaces a board that is already on screen: the socket's join snapshot is
    // always at least as fresh, and a live event can only reach this client
    // after that snapshot, so overwriting with an older read could silently
    // drop a proposal that arrived while this request was in flight.
    async function load() {
      try {
        const data = await api.get<BoardResponse>(`/api/sessions/${sessionId}/proposals`);
        if (!cancelled) setBoard((prev) => prev ?? data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load board');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, reloadToken]);

  useEffect(() => {
    if (!sessionId) return;
    const socket = getSocket();
    let cancelled = false;

    const join = () => {
      socket.emit('memberJoin', { sessionId }, (res) => {
        if (cancelled) return;
        setIsLive(res.ok);
        if (!res.ok) {
          console.error(`[pinboard] could not join the session room: ${res.error ?? 'unknown'}`);
        }
      });
    };

    // A reconnected socket is a brand-new socket belonging to no rooms, so every
    // connect must rejoin. Rejoining is also the catch-up: events broadcast
    // while this client was away went to a room it was not in and are gone, and
    // the server answers a join with a fresh full board (F15 — "reconnects after
    // missing 2–3 events"). No REST refetch, which would race the live events
    // arriving behind it.
    const onConnect = () => join();

    const onDisconnect = () => setIsLive(false);
    const onSessionState = (snapshot: SessionStatePayload) => applySnapshot(snapshot);
    const onCreated = ({ proposal }: { proposal: BoardItem }) => {
      upsertItem(proposal);
      highlight(proposal.id);
    };
    const onUpdated = ({ proposal }: { proposal: BoardItem }) => upsertItem(proposal);
    const onDeleted = ({ proposalId, questionId }: { proposalId: string; questionId: string }) =>
      removeItem(proposalId, questionId);

    if (socket.connected) onConnect();
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('sessionState', onSessionState);
    socket.on('proposalCreated', onCreated);
    socket.on('proposalUpdated', onUpdated);
    socket.on('proposalDeleted', onDeleted);

    return () => {
      cancelled = true;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('sessionState', onSessionState);
      socket.off('proposalCreated', onCreated);
      socket.off('proposalUpdated', onUpdated);
      socket.off('proposalDeleted', onDeleted);
    };
  }, [sessionId, applySnapshot, highlight, removeItem, upsertItem]);

  /**
   * Send a proposal intent. Nothing is inserted locally on success — the card
   * arrives on the `proposalCreated` broadcast like it does for everyone else,
   * so the proposer's board is built from exactly the same events as the rest
   * of the room and cannot drift from it.
   */
  const propose = useCallback(
    (input: ProposalCreateInput) =>
      new Promise<void>((resolve, reject) => {
        getSocket().emit('proposalCreate', input, (res) => {
          if (res.ok) resolve();
          else reject(new Error(res.error ?? 'Proposal was rejected'));
        });
      }),
    [],
  );

  return { board, loading, error, reload, propose, isLive, newItemIds };
}

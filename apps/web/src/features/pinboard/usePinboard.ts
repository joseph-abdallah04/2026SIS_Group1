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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [newItemIds, setNewItemIds] = useState<ReadonlySet<string>>(() => new Set());

  const reload = useCallback(() => {
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

  const applySnapshot = useCallback(
    (snapshot: SessionStatePayload) => {
      if (snapshot.sessionId !== sessionId) return;
      setBoard((prev) => ({
        sessionId,
        sessionTitle: prev?.sessionTitle ?? 'Session',
        questionId: snapshot.questionId,
        questionText: prev?.questionText ?? null,
        questionPosition: prev?.questionPosition ?? null,
        questionStatus: prev?.questionStatus ?? null,
        items: [...snapshot.proposals].sort(compareBoardItems),
      }));
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

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.get<BoardResponse>(`/api/sessions/${sessionId}/proposals`);
        if (!cancelled) setBoard(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load board');
        }
      } finally {
        if (!cancelled) setLoading(false);
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
    let hasConnectedBefore = false;

    const join = () => {
      socket.emit('memberJoin', { sessionId }, (res) => {
        if (cancelled) return;
        setIsLive(res.ok);
        if (!res.ok) {
          console.error(`[pinboard] could not join the session room: ${res.error ?? 'unknown'}`);
        }
      });
    };

    const onConnect = () => {
      // A reconnected socket is a brand-new socket belonging to no rooms, so
      // every connect must rejoin. On a *re*connect we also refetch over REST:
      // whatever was broadcast while we were away went to a room we were not
      // in, so those events are gone and the snapshot is the only way to catch
      // up (F15 — "reconnects after missing 2–3 events").
      join();
      if (hasConnectedBefore) reload();
      hasConnectedBefore = true;
    };

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
  }, [sessionId, applySnapshot, highlight, reload, removeItem, upsertItem]);

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

import { useCallback, useEffect, useState } from 'react';
import type { BoardItem, BoardResponse } from '@roundtable/shared';
import type { SessionStatePayload } from '@roundtable/shared/events';

import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';

export function usePinboard(sessionId: string) {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  const applySnapshot = useCallback((snapshot: SessionStatePayload) => {
    if (snapshot.sessionId !== sessionId) return;
    setBoard((prev) => ({
      sessionId,
      sessionTitle: prev?.sessionTitle ?? 'Session',
      questionId: snapshot.questionId,
      questionText: prev?.questionText ?? null,
      questionPosition: prev?.questionPosition ?? null,
      questionStatus: prev?.questionStatus ?? null,
      items: snapshot.proposals,
    }));
  }, [sessionId]);

  const upsertItem = useCallback((proposal: BoardItem) => {
    setBoard((prev) => {
      if (!prev || proposal.questionId !== prev.questionId) return prev;
      const items = prev.items.filter((item) => item.id !== proposal.id);
      items.push(proposal);
      items.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
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
        const data = await api.get<BoardResponse>(`/api/sessions/${sessionId}/board`);
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
    const token = localStorage.getItem('rt_token') ?? undefined;
    const socket = getSocket(token);

    const onSessionState = (snapshot: SessionStatePayload) => applySnapshot(snapshot);
    const onCreated = ({ proposal }: { proposal: BoardItem }) => upsertItem(proposal);
    const onUpdated = ({ proposal }: { proposal: BoardItem }) => upsertItem(proposal);
    const onDeleted = ({
      proposalId,
      questionId,
    }: {
      proposalId: string;
      questionId: string;
    }) => removeItem(proposalId, questionId);

    socket.on('sessionState', onSessionState);
    socket.on('proposalCreated', onCreated);
    socket.on('proposalUpdated', onUpdated);
    socket.on('proposalDeleted', onDeleted);

    return () => {
      socket.off('sessionState', onSessionState);
      socket.off('proposalCreated', onCreated);
      socket.off('proposalUpdated', onUpdated);
      socket.off('proposalDeleted', onDeleted);
    };
  }, [applySnapshot, removeItem, upsertItem]);

  return { board, loading, error, reload };
}

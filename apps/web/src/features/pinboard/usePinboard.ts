import { useCallback, useEffect, useRef, useState } from 'react';
import { compareBoardItems, type BoardItem, type BoardResponse } from '@roundtable/shared';
import type { SessionStatePayload, WriteAck } from '@roundtable/shared/events';
import type { ProposalCreateInput, ProposalUpdateInput } from '@roundtable/shared/schemas';

import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';

/** How long a card that arrived while you were watching stays highlighted (F15). */
const HIGHLIGHT_MS = 2400;

/**
 * How long to wait for a write to be acknowledged before giving up on it.
 *
 * Without a deadline a socket that drops mid-write leaves the promise pending
 * forever, and a dragged card would sit at a position the server never
 * accepted with nothing to put it back (F16).
 */
const WRITE_TIMEOUT_MS = 8000;

/**
 * Send a write intent and settle when the server answers.
 *
 * Nothing is changed locally on success: the authoritative row arrives on the
 * matching broadcast for everyone at once, so the writer's board is built from
 * the same events as the rest of the room and cannot drift from it.
 *
 * The deadline matters because a socket that drops mid-write never acks, and a
 * caller left waiting forever cannot undo what it optimistically showed — a
 * dragged card would sit at a position the server never accepted (F16).
 */
function writeIntent(
  send: (ack: (res: WriteAck) => void) => void,
  rejectionFallback: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('No response from the server — check your connection'));
    }, WRITE_TIMEOUT_MS);

    send((res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (res.ok) {
        resolve();
        return;
      }
      // Callers (the creative tools) branch on `code` to tell one refusal from
      // another, so it travels with the error rather than being flattened away.
      const error = new Error(res.error ?? rejectionFallback);
      reject(res.code ? Object.assign(error, { code: res.code }) : error);
    });
  });
}

export function usePinboard(sessionId: string) {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [newItemIds, setNewItemIds] = useState<ReadonlySet<string>>(() => new Set());
  // Who the server says this socket is. Null until the join snapshot lands,
  // which is also exactly when writing becomes possible (F16).
  const [viewerId, setViewerId] = useState<string | null>(null);

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
    ({ proposals, viewer, ...meta }: SessionStatePayload) => {
      if (meta.sessionId !== sessionId) return;
      setError(null);
      setViewerId(viewer.id);
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

    // First paint, and the only path that works with no socket at all. The
    // *first* read never replaces a board that is already on screen: the
    // socket's join snapshot is always at least as fresh, and a live event can
    // only reach this client after that snapshot, so overwriting with an older
    // read could silently drop a proposal that arrived while this request was
    // in flight.
    //
    // A later read (`reloadToken > 0`) is the opposite case — something asked
    // for the board again precisely because the one on screen is stale. F25 is
    // why that matters: when the leader advances the agenda the active question
    // changes, so the board must swap to a different question's proposals
    // entirely, and keeping `prev` would leave the previous question's cards up.
    async function load() {
      try {
        const data = await api.get<BoardResponse>(`/api/sessions/${sessionId}/proposals`);
        if (!cancelled) setBoard((prev) => (reloadToken === 0 ? (prev ?? data) : data));
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
    // F25: the leader moved the agenda. Which question is active — and so
    // which proposals belong on this board, and whether it accepts writes at
    // all — is the server's to decide, so this re-reads rather than trying to
    // reproduce that rule from the one status in the payload.
    const onPhase = ({ sessionId: id }: { sessionId: string }) => {
      if (id === sessionId) reload();
    };
    const onFocus = ({ sessionId: id }: { sessionId: string }) => {
      if (id === sessionId) reload();
    };

    if (socket.connected) onConnect();
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('sessionState', onSessionState);
    socket.on('proposalCreated', onCreated);
    socket.on('proposalUpdated', onUpdated);
    socket.on('proposalDeleted', onDeleted);
    socket.on('sessionPhase', onPhase);
    socket.on('sessionFocus', onFocus);

    return () => {
      cancelled = true;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('sessionState', onSessionState);
      socket.off('proposalCreated', onCreated);
      socket.off('proposalUpdated', onUpdated);
      socket.off('proposalDeleted', onDeleted);
      socket.off('sessionPhase', onPhase);
      socket.off('sessionFocus', onFocus);
    };
  }, [sessionId, applySnapshot, highlight, reload, removeItem, upsertItem]);

  /** Propose a new item onto the board (F15). */
  const propose = useCallback(
    (input: ProposalCreateInput) =>
      writeIntent((ack) => getSocket().emit('proposalCreate', input, ack), 'Proposal was rejected'),
    [],
  );

  /**
   * Edit or move a proposal (F16). Like `propose`, nothing is changed locally:
   * the authoritative row arrives on `proposalUpdated` for everyone at once, so
   * the editor's board is built from the same events as the rest of the room.
   * The one exception is a drag in flight, which `useProposalDrag` holds on
   * screen so the card does not snap back for the round trip.
   */
  const editProposal = useCallback(
    (input: ProposalUpdateInput) =>
      writeIntent(
        (ack) => getSocket().emit('proposalUpdate', input, ack),
        'That change was rejected',
      ),
    [],
  );

  /** Remove a proposal you authored (F16). Server soft-deletes and broadcasts. */
  const deleteProposal = useCallback(
    (proposalId: string) =>
      writeIntent(
        (ack) => getSocket().emit('proposalDelete', { id: proposalId }, ack),
        'That proposal could not be removed',
      ),
    [],
  );

  return {
    board,
    loading,
    error,
    reload,
    propose,
    editProposal,
    deleteProposal,
    isLive,
    newItemIds,
    viewerId,
  };
}

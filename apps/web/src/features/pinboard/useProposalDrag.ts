import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardItem, CardRect } from '@roundtable/shared';

import { cardSize } from '../tools/proposalPlacement';
import { clampGroupDelta } from './boardSelection';

/** Below this many pixels a pointer gesture is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;

interface Point {
  x: number;
  y: number;
}

/** One card being carried, with where it started and how much board it covers. */
interface Carried {
  id: string;
  /** Measured at grab time: a sticky's size depends on what it says. */
  rect: CardRect;
}

interface Gesture {
  /** The card under the pointer. */
  proposalId: string;
  /** Every card moving together: just the one, or the whole selection. */
  carried: Carried[];
  pointerId: number;
  /** Where the pointer went down, in screen pixels. */
  fromPointer: Point;
  /**
   * Latest offset from where the cards started, mirrored out of React state.
   * Pointer moves are batched, so on release the rendered value can still be
   * one frame behind — committing from a ref means the cards are saved where
   * they were let go.
   */
  delta: Point;
  moved: boolean;
}

interface UseProposalDragArgs {
  items: readonly BoardItem[];
  /** Board-to-screen factor, so a pointer delta converts to board units. */
  scale: number;
  /** Persist one card's final position. Rejecting puts that card back where it was. */
  onCommit: (proposalId: string, position: Point) => Promise<void>;
  onError: (message: string) => void;
  /** A press that never became a drag. */
  onTap?: (item: BoardItem) => void;
}

/**
 * Drag-to-reposition for F16, one card or a selection of them.
 *
 * Two deliberate choices:
 *
 * 1. Nothing is sent while the pointer is moving. docs/02 §4 allows a live
 *    broadcast of every move with a throttled write behind it, but that needs
 *    an ephemeral "someone is dragging" event the room can render, a separate
 *    channel from the persisted fact and not what F16 asks for. One write per
 *    card on release keeps the board authoritative and the socket quiet.
 *
 * 2. The dragged positions are held locally until the server's own broadcast
 *    carries them back. Clearing them on ack instead would snap the cards to
 *    their old places for the round trip, then jump again when the broadcast
 *    landed.
 *
 * A group moves as one: the offset is the same for every card, and it stops
 * at the sheet's edge for all of them, so the arrangement survives the move.
 * Each card is still its own write, checked by the server on its own, so a
 * card the server refuses goes back without taking the others with it.
 */
export function useProposalDrag({ items, scale, onCommit, onError, onTap }: UseProposalDragArgs) {
  const gesture = useRef<Gesture | null>(null);
  const [dragging, setDragging] = useState<ReadonlyMap<string, Point> | null>(null);
  const [pending, setPending] = useState<ReadonlyMap<string, Point>>(() => new Map());

  // Release a held position once the board agrees with it, or once the card is
  // gone, so a deleted proposal cannot leak an entry.
  useEffect(() => {
    setPending((prev) => {
      if (prev.size === 0) return prev;
      const byId = new Map(items.map((item) => [item.id, item]));
      const next = new Map(prev);
      for (const [id, held] of prev) {
        const item = byId.get(id);
        if (!item || (item.x === held.x && item.y === held.y)) next.delete(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  /** Where a card should render: mid-drag, held after a drag, or as stored. */
  const positionOf = useCallback(
    (item: BoardItem): Point =>
      dragging?.get(item.id) ?? pending.get(item.id) ?? { x: item.x, y: item.y },
    [dragging, pending],
  );

  /**
   * Starts carrying `item`, and with it every card in `group` — the selection
   * it belongs to, or nothing more than itself.
   */
  const onPointerDown = useCallback(
    (item: BoardItem, event: React.PointerEvent<HTMLElement>, group?: readonly BoardItem[]) => {
      // Left button / touch / pen only, and never from a control inside the card.
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest('button, textarea, a, input')) return;

      // Without this the browser starts its own gesture — selecting the card's
      // text, or dragging its image as a file — which cancels the pointer
      // stream mid-drag. The card then follows briefly and snaps back, with no
      // write ever attempted.
      event.preventDefault();

      const cards = group && group.some((member) => member.id === item.id) ? group : [item];
      gesture.current = {
        proposalId: item.id,
        carried: cards.map((card) => ({
          id: card.id,
          rect: { ...positionOf(card), ...cardSize(card) },
        })),
        pointerId: event.pointerId,
        fromPointer: { x: event.clientX, y: event.clientY },
        delta: { x: 0, y: 0 },
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [positionOf],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;

      const px = event.clientX - active.fromPointer.x;
      const py = event.clientY - active.fromPointer.y;
      if (!active.moved && Math.hypot(px, py) < DRAG_THRESHOLD_PX) return;
      active.moved = true;

      // Screen pixels divided by the zoom factor: at 60% the cards must follow
      // the pointer, which means moving further in board units than on screen.
      // Kept wholly on the sheet, so a card can never be dragged off the board
      // to somewhere nobody can pan to.
      //
      // Written to the ref as well as to state, and the ref is what gets saved:
      // pointer moves are batched, so on release the rendered value can still
      // be a frame behind.
      const allowed = clampGroupDelta(
        active.carried.map((card) => card.rect),
        px / scale,
        py / scale,
      );
      active.delta = { x: Math.round(allowed.dx), y: Math.round(allowed.dy) };
      setDragging(
        new Map(
          active.carried.map((card) => [
            card.id,
            { x: card.rect.x + active.delta.x, y: card.rect.y + active.delta.y },
          ]),
        ),
      );
    },
    [scale],
  );

  const endGesture = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      gesture.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      setDragging(null);
      if (!active.moved) {
        const item = items.find((candidate) => candidate.id === active.proposalId);
        if (item && event.type === 'pointerup') onTap?.(item);
        return;
      }
      // Picked up and put back down: nothing to tell the room about.
      if (active.delta.x === 0 && active.delta.y === 0) return;

      const landed = active.carried.map((card) => ({
        id: card.id,
        at: { x: card.rect.x + active.delta.x, y: card.rect.y + active.delta.y },
      }));
      setPending((prev) => {
        const next = new Map(prev);
        for (const { id, at } of landed) next.set(id, at);
        return next;
      });

      // One notice for the whole group, however many of its moves were refused.
      let reported = false;
      for (const { id, at } of landed) {
        void onCommit(id, at).catch((err: unknown) => {
          // The server refused this move, so this card belongs where it was.
          setPending((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
          if (reported) return;
          reported = true;
          onError(err instanceof Error ? err.message : 'Could not move that proposal');
        });
      }
    },
    [items, onCommit, onError, onTap],
  );

  return {
    positionOf,
    /** Whether this card is being carried right now. */
    isDragging: (id: string) => dragging?.has(id) ?? false,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endGesture,
      onPointerCancel: endGesture,
    },
  };
}

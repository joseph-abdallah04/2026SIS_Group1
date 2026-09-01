import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardItem } from '@roundtable/shared';

/** Below this many pixels a pointer gesture is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;

interface Point {
  x: number;
  y: number;
}

interface Gesture {
  proposalId: string;
  pointerId: number;
  /** Where the pointer went down, in screen pixels. */
  fromPointer: Point;
  /** Where the card was, in board coordinates. */
  fromCard: Point;
  /**
   * Latest dragged position, mirrored out of React state. Pointer moves are
   * batched, so on release the rendered `dragging` value can still be one frame
   * behind — committing from a ref means the card is saved where it was let go.
   */
  at: Point;
  moved: boolean;
}

interface UseProposalDragArgs {
  items: readonly BoardItem[];
  /** Board-to-screen factor, so a pointer delta converts to board units. */
  scale: number;
  /** Persist the final position. Rejecting puts the card back where it was. */
  onCommit: (proposalId: string, position: Point) => Promise<void>;
  onError: (message: string) => void;
}

/**
 * Drag-to-reposition for F16.
 *
 * Two deliberate choices:
 *
 * 1. Nothing is sent while the pointer is moving. docs/02 §4 allows a live
 *    broadcast of every move with a throttled write behind it, but that needs
 *    an ephemeral "someone is dragging" event the room can render, a separate
 *    channel from the persisted fact and not what F16 asks for. One write on
 *    release keeps the board authoritative and the socket quiet.
 *
 * 2. The dragged position is held locally until the server's own broadcast
 *    carries it back. Clearing it on ack instead would snap the card to its old
 *    place for the round trip, then jump again when the broadcast landed.
 */
export function useProposalDrag({ items, scale, onCommit, onError }: UseProposalDragArgs) {
  const gesture = useRef<Gesture | null>(null);
  const [dragging, setDragging] = useState<{ proposalId: string; at: Point } | null>(null);
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
    (item: BoardItem): Point => {
      if (dragging?.proposalId === item.id) return dragging.at;
      return pending.get(item.id) ?? { x: item.x, y: item.y };
    },
    [dragging, pending],
  );

  const onPointerDown = useCallback(
    (item: BoardItem, event: React.PointerEvent<HTMLElement>) => {
      // Left button / touch / pen only, and never from a control inside the card.
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest('button, textarea, a, input')) return;

      // Without this the browser starts its own gesture — selecting the card's
      // text, or dragging its image as a file — which cancels the pointer
      // stream mid-drag. The card then follows briefly and snaps back, with no
      // write ever attempted.
      event.preventDefault();

      const from = positionOf(item);
      gesture.current = {
        proposalId: item.id,
        pointerId: event.pointerId,
        fromPointer: { x: event.clientX, y: event.clientY },
        fromCard: from,
        at: from,
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

      const dx = event.clientX - active.fromPointer.x;
      const dy = event.clientY - active.fromPointer.y;
      if (!active.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      active.moved = true;

      // Screen pixels divided by the zoom factor: at 60% the card must follow
      // the pointer, which means moving further in board units than on screen.
      // Clamped at the origin so a card cannot be flung somewhere unscrollable.
      //
      // Written to the ref as well as to state, and the ref is what gets saved:
      // pointer moves are batched, so on release the rendered value can still
      // be a frame behind. Updating only `setDragging` here would leave the ref
      // holding the position the drag *started* at, and every move would
      // faithfully save the card back to where it already was.
      active.at = {
        x: Math.max(0, Math.round(active.fromCard.x + dx / scale)),
        y: Math.max(0, Math.round(active.fromCard.y + dy / scale)),
      };
      setDragging({ proposalId: active.proposalId, at: active.at });
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

      const landed = active.at;
      setDragging(null);
      if (!active.moved) return;
      // Picked up and put back down: nothing to tell the room about.
      if (landed.x === active.fromCard.x && landed.y === active.fromCard.y) return;

      setPending((prev) => new Map(prev).set(active.proposalId, landed));
      void onCommit(active.proposalId, landed).catch((err: unknown) => {
        // The server refused the move, so the card belongs where it was.
        setPending((prev) => {
          const next = new Map(prev);
          next.delete(active.proposalId);
          return next;
        });
        onError(err instanceof Error ? err.message : 'Could not move that proposal');
      });
    },
    [onCommit, onError],
  );

  return {
    positionOf,
    draggingId: dragging?.proposalId ?? null,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endGesture,
      onPointerCancel: endGesture,
    },
  };
}

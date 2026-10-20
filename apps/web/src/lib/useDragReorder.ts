import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';

import {
  droppedOrder,
  followPointer,
  landingIndex,
  landingOffset,
  measureRows,
  REORDER_EASING,
  REORDER_MS,
  rubberBand,
  slideShifts,
  type RowLayout,
} from './dragReorder';
import { closingFades } from './motion';

interface DragState {
  id: string;
  /** How far the lifted row has travelled from its place. */
  offset: number;
  /** How far each row it has passed has slid to make room. */
  shifts: Record<string, number>;
  /** Let go, and easing into the gap. */
  settling: boolean;
  /** The order the rows would be in if it were let go now. */
  order: string[];
}

interface UseDragReorderOptions {
  /** The data attribute each row carries its id in, e.g. `data-question-key`. */
  attribute: string;
  /** The rows' ids, in their order now. */
  ids: readonly string[];
  /** Called once the dropped row has eased into its gap. */
  onMove: (id: string, toIndex: number) => void;
}

/**
 * Drag a row of a local list to another place by a handle: the agenda rail's
 * drag, for a list whose order lives in this page rather than on the server.
 *
 * Past 4px the row lifts and follows the pointer, the rows it passes slide out
 * of its way, and past the first or last row it gives a little. Let go, it
 * eases into the gap and only then does the order change, so the new order
 * lands on rows that have stopped moving. With less motion asked for it moves
 * at once.
 *
 * Pointer events rather than the browser's drag and drop, which draws its own
 * ghost image and cursor that cannot be changed.
 */
export function useDragReorder({ attribute, ids, onMove }: UseDragReorderOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const press = useRef<{
    id: string;
    row: HTMLElement;
    layout?: RowLayout;
    target?: number;
  } | null>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  const detach = useRef<(() => void) | null>(null);
  const onMoveRef = useRef(onMove);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  onMoveRef.current = onMove;
  useEffect(
    () => () => {
      window.clearTimeout(settleTimer.current);
      detach.current?.();
    },
    [],
  );

  /** Follows the pointer down the list, `travelled` scrolling included. */
  function follow(travelled: number) {
    const started = press.current;
    if (!started) return;
    if (!started.layout) {
      // A few pixels of wobble is still a press.
      if (Math.abs(travelled) < 4) return;
      started.layout = measureRows(started.row, started.id, attribute);
    }
    const { min, max } = started.layout;
    const offset = Math.min(max, Math.max(min, travelled));
    const target = landingIndex(started.layout, offset);
    started.target = target;
    setDrag({
      id: started.id,
      offset: offset + rubberBand(travelled - offset),
      shifts: slideShifts(started.layout, target),
      settling: false,
      order: droppedOrder(started.layout, target),
    });
  }

  function letGo(cancelled: boolean) {
    const started = press.current;
    press.current = null;
    detach.current?.();
    detach.current = null;
    if (!started) return;
    const { id, layout, target } = started;
    if (cancelled) {
      setDrag(null);
      return;
    }
    if (!layout || target === undefined) return;
    const moved = target !== layout.self;
    const finish = () => {
      setDrag(null);
      // The place was worked out on the rows as they were when it lifted. If
      // they changed while it settled (one removed, pasted in, moved by key),
      // that place may be another now: it goes back where it was instead.
      if (moved && idsRef.current.join() === layout.ids.join()) onMoveRef.current(id, target);
    };
    if (!closingFades()) {
      finish();
      return;
    }
    // Into the gap the other rows have opened, or back home.
    setDrag(
      (current) =>
        current && {
          ...current,
          offset: moved ? landingOffset(layout, target) : 0,
          shifts: moved ? current.shifts : {},
          settling: true,
        },
    );
    settleTimer.current = window.setTimeout(finish, REORDER_MS);
  }

  const handlers = useRef({ follow, letGo });
  handlers.current = { follow, letGo };

  function handleProps(id: string) {
    return {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || drag || press.current) return;
        const row = event.currentTarget.closest<HTMLElement>(`[${attribute}]`);
        if (!row) return;
        // Text selected anywhere on the page would otherwise be what moves.
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Not every pointer can be captured; `followPointer` hears it anyway.
        }
        press.current = { id, row };
        // The handlers are read through a ref when the events come, not
        // closed over now: they belong to whichever render is current then.
        detach.current = followPointer(
          { pointerId: event.pointerId, startY: event.clientY, list: row.parentElement },
          {
            move: (travelled) => handlers.current.follow(travelled),
            up: () => handlers.current.letGo(false),
            cancel: () => handlers.current.letGo(true),
          },
        );
      },
      onDragStart: (event: React.DragEvent<HTMLElement>) => event.preventDefault(),
    };
  }

  /** The slide for one row while a drag is on, or nothing. */
  function rowStyle(id: string): CSSProperties | undefined {
    if (!drag) return undefined;
    const lifted = drag.id === id;
    const shift = lifted ? drag.offset : (drag.shifts[id] ?? 0);
    return {
      transform: `translateY(${shift}px)`,
      // The lifted row is the pointer's until it is let go.
      transition: lifted && !drag.settling ? 'none' : `transform ${REORDER_MS}ms ${REORDER_EASING}`,
      position: 'relative',
      zIndex: lifted ? 10 : undefined,
    };
  }

  return {
    /** The row being dragged, if any. */
    draggingId: drag?.id ?? null,
    /** The order the rows would land in, while a drag is on: for numbering them as it goes. */
    previewOrder: drag?.order ?? null,
    handleProps,
    rowStyle,
  };
}

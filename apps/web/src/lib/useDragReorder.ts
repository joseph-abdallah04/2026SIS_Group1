import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';

import {
  droppedOrder,
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
export function useDragReorder({ attribute, onMove }: UseDragReorderOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const press = useRef<{
    id: string;
    pointerId: number;
    startY: number;
    /** The pointer's latest height, for a scroll that comes without a move. */
    lastY: number;
    row: HTMLElement;
    /** Where the list's top was when the press began, to see it scroll since. */
    listTop: number;
    layout?: RowLayout;
    target?: number;
  } | null>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  const detach = useRef<(() => void) | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  useEffect(
    () => () => {
      window.clearTimeout(settleTimer.current);
      detach.current?.();
    },
    [],
  );

  function listTopOf(row: HTMLElement) {
    return row.parentElement?.getBoundingClientRect().top ?? 0;
  }

  /** Follows the pointer: how far it has travelled down the list, scrolling included. */
  function follow() {
    const started = press.current;
    if (!started) return;
    // A list that scrolls under a held row moves its rows, not the pointer:
    // the pointer has travelled that far along the list all the same.
    const travelled = started.lastY - started.startY + (started.listTop - listTopOf(started.row));
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
      if (moved) onMoveRef.current(id, target);
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

  function handleProps(id: string) {
    return {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || drag || press.current) return;
        const row = event.currentTarget.closest<HTMLElement>(`[${attribute}]`);
        if (!row) return;
        // Text selected anywhere on the page would otherwise be what moves.
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        const pointerId = event.pointerId;
        try {
          event.currentTarget.setPointerCapture(pointerId);
        } catch {
          // Not every pointer can be captured; the window still hears it.
        }
        press.current = {
          id,
          pointerId,
          startY: event.clientY,
          lastY: event.clientY,
          row,
          listTop: listTopOf(row),
        };
        // Heard on the window, not the handle: the handle may slide out from
        // under the pointer (a scroll, a held row at its limit), and a let-go
        // that lands elsewhere must still end the drag.
        const onPointerMove = (e: globalThis.PointerEvent) => {
          if (e.pointerId !== pointerId || !press.current) return;
          press.current.lastY = e.clientY;
          follow();
        };
        const onPointerUp = (e: globalThis.PointerEvent) => {
          if (e.pointerId === pointerId) letGo(false);
        };
        const onPointerCancel = (e: globalThis.PointerEvent) => {
          if (e.pointerId === pointerId) letGo(true);
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerCancel);
        window.addEventListener('scroll', follow, true);
        detach.current = () => {
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          window.removeEventListener('pointercancel', onPointerCancel);
          window.removeEventListener('scroll', follow, true);
        };
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

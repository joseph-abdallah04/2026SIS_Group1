import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface Point {
  x: number;
  y: number;
}

export const MARGIN = 8;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Keeps a box of `width` fully horizontally in the window, and its top edge on screen. */
export function clampPoint(point: Point, width: number): Point {
  return {
    x: clamp(point.x, MARGIN, Math.max(MARGIN, window.innerWidth - width - MARGIN)),
    y: clamp(point.y, MARGIN, Math.max(MARGIN, window.innerHeight - 48)),
  };
}

interface Options {
  /** Where it was left, or `null` if it has not been placed. */
  saved: Point | null;
  /** Where it goes the first time. */
  home: () => Point;
  width: () => number;
  /** Called with the final position when a drag ends. */
  onCommit: (point: Point) => void;
  /** Called when a press ends without having moved. */
  onTap?: () => void;
  onDragStart?: () => void;
  /** Where a press does not start a drag, such as a button on the title bar. */
  ignore?: string;
}

/**
 * A box that is dragged by its title bar and stays inside the window.
 *
 * Pointer capture rather than listeners on the window, which the app's own
 * handlers would also see. A press that never moves is reported as a tap, so
 * the same handle can be both a drag handle and a button.
 */
export function useFloating({ saved, home, width, onCommit, onTap, onDragStart, ignore }: Options) {
  const [point, setPoint] = useState<Point>(() => clampPoint(saved ?? home(), width()));
  const [dragging, setDragging] = useState(false);
  const latest = useRef(point);
  latest.current = point;
  const gesture = useRef<{ id: number; from: Point; origin: Point; moved: boolean } | null>(null);

  useEffect(() => {
    const onResize = () => setPoint((current) => clampPoint(current, width()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [width]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      if (ignore && event.target instanceof Element && event.target.closest(ignore)) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = {
        id: event.pointerId,
        from: { x: event.clientX, y: event.clientY },
        origin: latest.current,
        moved: false,
      };
    },
    [ignore],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = gesture.current;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.from.x;
      const dy = event.clientY - drag.from.y;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        setDragging(true);
        onDragStart?.();
      }
      setPoint(clampPoint({ x: drag.origin.x + dx, y: drag.origin.y + dy }, width()));
    },
    [onDragStart, width],
  );

  const finish = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = gesture.current;
      if (!drag || drag.id !== event.pointerId) return;
      gesture.current = null;
      setDragging(false);
      if (drag.moved) onCommit(latest.current);
      else onTap?.();
    },
    [onCommit, onTap],
  );

  return {
    point,
    dragging,
    bind: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish },
  };
}

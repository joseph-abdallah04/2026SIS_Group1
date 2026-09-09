// Where the assistant panel sits and how big it is.
//
// It started life anchored to the bottom-right corner at a fixed size, which put its top edge
// straight through the board header — the session status and End session live up there, and
// the panel was covering them. Rather than pick a different fixed size that would be wrong on
// somebody else's screen, the panel is now movable and resizable, and remembers where you put
// it.
//
// The maths lives in exported pure functions so it can be tested directly: jsdom has no
// layout, so simulating a drag there proves nothing about whether the arithmetic is right.
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';

export interface PanelGeometry {
  /** Viewport coordinates of the panel's top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 260;

const DEFAULT_WIDTH = 420;
const DEFAULT_MAX_HEIGHT = 620;
/** Clears the creative toolbar along the bottom of the board. */
const BOTTOM_INSET = 96;
const RIGHT_INSET = 24;
/** Clears the board header, which is what the old fixed height was covering. */
const TOP_INSET = 72;
/** How much of the panel must stay on screen, so it can always be dragged back. */
const EDGE_KEEP = 48;

const STORAGE_KEY = 'rt_assistant_panel_geometry';

export function defaultGeometry(viewportWidth: number, viewportHeight: number): PanelGeometry {
  const width = Math.max(MIN_WIDTH, Math.min(DEFAULT_WIDTH, viewportWidth - RIGHT_INSET * 2));
  const height = Math.max(
    MIN_HEIGHT,
    Math.min(DEFAULT_MAX_HEIGHT, viewportHeight - BOTTOM_INSET - TOP_INSET),
  );
  return {
    width,
    height,
    x: viewportWidth - width - RIGHT_INSET,
    y: viewportHeight - height - BOTTOM_INSET,
  };
}

/**
 * Keeps the panel usable whatever the window does.
 *
 * `y` never goes below zero: the header is the drag handle, so letting it above the top edge
 * would strand the panel where it could not be grabbed again. Horizontally it may hang off
 * either side, as long as a grabbable strip stays visible.
 */
export function clampGeometry(
  geometry: PanelGeometry,
  viewportWidth: number,
  viewportHeight: number,
): PanelGeometry {
  const width = Math.min(Math.max(geometry.width, MIN_WIDTH), Math.max(viewportWidth, MIN_WIDTH));
  const height = Math.min(
    Math.max(geometry.height, MIN_HEIGHT),
    Math.max(viewportHeight, MIN_HEIGHT),
  );
  return {
    width,
    height,
    x: Math.min(Math.max(geometry.x, EDGE_KEEP - width), Math.max(viewportWidth - EDGE_KEEP, 0)),
    y: Math.min(Math.max(geometry.y, 0), Math.max(viewportHeight - EDGE_KEEP, 0)),
  };
}

/**
 * One corner drag.
 *
 * The edges the corner does *not* own stay exactly where they are — that is what stops the
 * panel creeping across the screen while you resize it, and what makes shrinking past the
 * minimum stop dead rather than pushing the opposite edge along.
 */
export function resizeFrom(
  start: PanelGeometry,
  corner: ResizeCorner,
  pointerX: number,
  pointerY: number,
): PanelGeometry {
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  let { x, y, width, height } = start;

  if (corner === 'ne' || corner === 'se') {
    width = Math.max(MIN_WIDTH, pointerX - start.x);
  } else {
    width = Math.max(MIN_WIDTH, right - pointerX);
    x = right - width;
  }

  if (corner === 'sw' || corner === 'se') {
    height = Math.max(MIN_HEIGHT, pointerY - start.y);
  } else {
    height = Math.max(MIN_HEIGHT, bottom - pointerY);
    y = bottom - height;
  }

  return { x, y, width, height };
}

function read(): PanelGeometry | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed as Record<string, unknown>;
    const numbers = ['x', 'y', 'width', 'height'] as const;
    if (!numbers.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))) {
      return null;
    }
    return {
      x: value.x as number,
      y: value.y as number,
      width: value.width as number,
      height: value.height as number,
    };
  } catch {
    return null;
  }
}

function write(geometry: PanelGeometry): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(geometry));
  } catch {
    // Storage disabled or full. Losing the remembered position is not worth breaking over.
  }
}

type Gesture =
  | { kind: 'move'; pointerId: number; offsetX: number; offsetY: number }
  | { kind: 'resize'; pointerId: number; corner: ResizeCorner; start: PanelGeometry };

/**
 * `localStorage`, not `sessionStorage` like the transcript: where you like your panel is a
 * lasting preference, not part of one conversation, and it applies to every session.
 */
export function usePanelGeometry() {
  const [geometry, setGeometry] = useState<PanelGeometry>(() => {
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const stored = read();
    return clampGeometry(stored ?? defaultGeometry(viewport.w, viewport.h), viewport.w, viewport.h);
  });
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  // The current geometry, readable outside a state updater. Persisting from *inside* one
  // would fire twice under StrictMode — the same impurity that made the transcript reducer
  // drop every word, and not a mistake worth making twice.
  const latest = useRef(geometry);
  latest.current = geometry;

  // A window that shrinks must not leave the panel unreachable.
  useEffect(() => {
    const onResize = () =>
      setGeometry((current) => clampGeometry(current, window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();

    // Read the pointer before the updater, so the updater is a pure function of `current`.
    const pointerX = event.clientX;
    const pointerY = event.clientY;
    setGeometry((current) => {
      const next =
        active.kind === 'move'
          ? { ...current, x: pointerX - active.offsetX, y: pointerY - active.offsetY }
          : resizeFrom(active.start, active.corner, pointerX, pointerY);
      return clampGeometry(next, window.innerWidth, window.innerHeight);
    });
  }, []);

  const endGesture = useCallback((event: PointerEvent<HTMLElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    // Persist on release rather than on every frame: one write per gesture, not sixty.
    write(latest.current);
  }, []);

  const startMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      // The header carries Clear and Close; a press on either is a click, not a drag.
      if ((event.target as HTMLElement).closest('button')) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = {
        kind: 'move',
        pointerId: event.pointerId,
        offsetX: event.clientX - geometry.x,
        offsetY: event.clientY - geometry.y,
      };
      setDragging(true);
    },
    [geometry.x, geometry.y],
  );

  const startResize = useCallback(
    (corner: ResizeCorner) => (event: PointerEvent<HTMLElement>) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { kind: 'resize', pointerId: event.pointerId, corner, start: geometry };
      setDragging(true);
    },
    [geometry],
  );

  /** Back to the corner, at a size that clears the board header. */
  const reset = useCallback(() => {
    const fresh = defaultGeometry(window.innerWidth, window.innerHeight);
    setGeometry(fresh);
    write(fresh);
  }, []);

  return { geometry, dragging, startMove, startResize, onPointerMove, endGesture, reset };
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type { BoardRailSide } from './BoardRail';

/** Narrower and the question cards stop fitting a line of text and a chip. */
export const RAIL_MIN_WIDTH = 224;
/** Where a rail opens before anyone has dragged it, and what double-click restores. */
export const RAIL_DEFAULT_WIDTH = 288;
/** Wider and the rail stops being beside the board and starts competing with it. */
export const RAIL_MAX_WIDTH = 480;
/**
 * How far past the minimum a drag can go before the rail closes. Without the
 * slack, a drag that only meant to make the rail as small as it goes would
 * close it the moment it overshot by a pixel.
 */
export const RAIL_CLOSE_GRACE = 72;
/** Of the window, so a small screen still leaves the board most of the row. */
const RAIL_MAX_SHARE = 0.4;
const KEY_STEP = 16;
const KEY_STEP_LARGE = 48;

const KEY_PREFIX = 'rt_rail_width';

/**
 * The widest the rail may be in a window this wide: `RAIL_MAX_WIDTH`, or less
 * on a narrow screen, but never under the minimum.
 */
export function railMaxWidth(windowWidth: number): number {
  return Math.max(
    RAIL_MIN_WIDTH,
    Math.min(RAIL_MAX_WIDTH, Math.floor(windowWidth * RAIL_MAX_SHARE)),
  );
}

function clamp(width: number, max: number): number {
  return Math.min(max, Math.max(RAIL_MIN_WIDTH, Math.round(width)));
}

/**
 * The width this browser last left the rail at.
 *
 * `localStorage` rather than the server for the same reason the mic preference
 * uses it: it is one person's layout, nobody else reads it. Every access is
 * wrapped, because storage throws outright in Safari's private mode and where
 * site data is blocked, and a remembered width is never worth a broken rail.
 * Anything stored that is not a width in range reads as "nothing stored".
 */
export function readRailWidth(storageKey: string): number | null {
  try {
    const stored = Number(localStorage.getItem(`${KEY_PREFIX}:${storageKey}`));
    return Number.isFinite(stored) && stored >= RAIL_MIN_WIDTH && stored <= RAIL_MAX_WIDTH
      ? stored
      : null;
  } catch {
    return null;
  }
}

function writeRailWidth(storageKey: string, width: number): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}:${storageKey}`, String(width));
  } catch {
    // Storage is unavailable or full. The rail is still this wide for this
    // visit; only its memory is lost.
  }
}

interface UseRailResizeOptions {
  side: BoardRailSide;
  /** Omitted for a rail that does not resize: the hook then does nothing. */
  storageKey?: string;
  collapsed: boolean;
  onToggle: () => void;
}

interface RailResize {
  /** The expanded width in pixels, or null for a rail that does not resize. */
  width: number | null;
  /** A drag is inside the grace distance: let go now and the rail closes. */
  pendingClose: boolean;
  dragging: boolean;
  handleProps: {
    role: 'separator';
    'aria-orientation': 'vertical';
    'aria-valuenow': number;
    'aria-valuemin': number;
    'aria-valuemax': number;
    tabIndex: 0;
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
    onDoubleClick: () => void;
  } | null;
}

/**
 * A rail edge that can be dragged, VS Code sidebar style.
 *
 * The rail follows the pointer between the minimum and the maximum. Past the
 * minimum it holds still for `RAIL_CLOSE_GRACE` pixels, and past that it
 * closes, live, while the button is still down. Dragging back out over the
 * minimum in the same gesture opens it again. A rail closed this way keeps
 * the width it had before the drag, so opening it later does not hand back
 * the squeezed version.
 *
 * What is remembered is what the person chose, not what the window allows: a
 * rail left at 480 shows at 280 in a small window and goes back to 480 when the
 * window does. So the preference only changes when a drag settles somewhere
 * new, a key moves the edge, or a double-click resets it — never because a
 * press on a capped edge happened to land on the cap.
 *
 * Move and release are heard on the window, not captured by the handle: the
 * handle is part of the expanded rail and unmounts when a drag closes it, and
 * the gesture has to outlive that to be able to reopen.
 *
 * No `requestAnimationFrame` throttle: browsers already deliver `pointermove`
 * once per frame and React batches the update, so one would only add a frame
 * of lag.
 */
export function useRailResize({
  side,
  storageKey,
  collapsed,
  onToggle,
}: UseRailResizeOptions): RailResize {
  const enabled = storageKey !== undefined;
  // The width chosen, uncapped. The window's cap is applied when it is shown.
  const [preferred, setPreferred] = useState(
    () => (storageKey ? readRailWidth(storageKey) : null) ?? RAIL_DEFAULT_WIDTH,
  );
  // Where the edge is mid-drag. Null otherwise, so the preference shows.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [maxWidth, setMaxWidth] = useState(() => railMaxWidth(window.innerWidth));
  const [pendingClose, setPendingClose] = useState(false);
  const [dragging, setDragging] = useState(false);
  const endDrag = useRef<(() => void) | null>(null);

  // The latest of these, for a gesture's window listeners to read.
  const onToggleRef = useRef(onToggle);
  const maxWidthRef = useRef(maxWidth);
  useEffect(() => {
    onToggleRef.current = onToggle;
    maxWidthRef.current = maxWidth;
  });

  useEffect(() => {
    if (!enabled) return;
    const onResize = () => setMaxWidth(railMaxWidth(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [enabled]);

  // A rail unmounted mid-drag still lets go of the window and the cursor.
  useEffect(() => () => endDrag.current?.(), []);

  const commit = useCallback(
    (next: number) => {
      setPreferred(next);
      if (storageKey) writeRailWidth(storageKey, next);
    },
    [storageKey],
  );

  const shown = dragWidth ?? clamp(preferred, maxWidth);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || endDrag.current) return;
      // Otherwise the drag starts selecting the agenda's text as it goes.
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = shown;
      const direction = side === 'left' ? 1 : -1;
      let current = startWidth;
      let closedByDrag = false;

      const body = document.body.style;
      const previousCursor = body.cursor;
      const previousUserSelect = body.userSelect;
      body.cursor = 'col-resize';
      body.userSelect = 'none';
      setDragging(true);

      const onMove = (move: PointerEvent) => {
        const raw = startWidth + (move.clientX - startX) * direction;
        if (closedByDrag) {
          // Hysteresis: reopen only back over the minimum, not at the point it
          // closed, so a pointer resting near the line does not flicker it.
          if (raw < RAIL_MIN_WIDTH) return;
          closedByDrag = false;
          onToggleRef.current();
        } else if (raw < RAIL_MIN_WIDTH - RAIL_CLOSE_GRACE) {
          closedByDrag = true;
          setPendingClose(false);
          onToggleRef.current();
          return;
        }
        setPendingClose(raw < RAIL_MIN_WIDTH);
        current = clamp(raw, maxWidthRef.current);
        setDragWidth(current);
      };

      const finish = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        body.cursor = previousCursor;
        body.userSelect = previousUserSelect;
        endDrag.current = null;
        setDragging(false);
        setPendingClose(false);
        setDragWidth(null);
        // Only a drag that ends open somewhere new is a choice. One that closed
        // the rail leaves the width it had for next time, and one that ended
        // where it began (a click, or a push against the window's cap) leaves
        // the preference alone, cap or no cap.
        if (!closedByDrag && current !== startWidth) commit(current);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
      endDrag.current = finish;
    },
    [commit, shown, side],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
      // "Grow" is towards the board, which is right of a left rail.
      const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
      const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
      // From the edge as shown, which in a capped window is not the
      // preference: stepping from that would move nothing visible.
      let next: number;
      if (event.key === grow) next = shown + step;
      else if (event.key === shrink) next = shown - step;
      else if (event.key === 'Home') next = RAIL_MIN_WIDTH;
      else if (event.key === 'End') next = maxWidth;
      else return;
      event.preventDefault();
      const clamped = clamp(next, maxWidth);
      // Pressing into the cap is not a choice to be narrower than the preference.
      if (clamped !== shown) commit(clamped);
    },
    [commit, maxWidth, shown, side],
  );

  const onDoubleClick = useCallback(() => commit(RAIL_DEFAULT_WIDTH), [commit]);

  if (!enabled) return { width: null, pendingClose: false, dragging: false, handleProps: null };

  return {
    width: shown,
    pendingClose,
    dragging,
    handleProps: collapsed
      ? null
      : {
          role: 'separator',
          'aria-orientation': 'vertical',
          'aria-valuenow': shown,
          'aria-valuemin': RAIL_MIN_WIDTH,
          'aria-valuemax': maxWidth,
          tabIndex: 0,
          onPointerDown,
          onKeyDown,
          onDoubleClick,
        },
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Point {
  x: number;
  y: number;
}

interface UseCanvasPanArgs {
  /** Size of the board in screen pixels, padding included. */
  contentWidth: number;
  contentHeight: number;
  /**
   * Ctrl/Cmd + wheel, and trackpad pinch, ask for a zoom rather than a pan.
   * The anchor is where the pointer sits inside the viewport, so the caller can
   * hold that point of the board still while the scale changes.
   */
  onZoom: (direction: 'in' | 'out', anchor: Point) => void;
}

/**
 * Panning for an infinite-canvas board (Figma/Miro model).
 *
 * The viewport never scrolls: it clips, and the board is moved underneath it by
 * a transform. That is what removes the browser's scrollbars entirely rather
 * than trying to style them, and it is why the dotted background can be tiled
 * across the whole window and simply offset — dots then appear to run on
 * forever instead of stopping where the content does.
 *
 * Pan is clamped to the board plus a screen of slack in each direction. Truly
 * unbounded panning reads as "infinite" for about five seconds and as "I have
 * lost my board" after that; a bounded range keeps the horizontal scrollbar
 * meaningful and keeps Fit able to bring everything back.
 */
export function useCanvasPan({ contentWidth, contentHeight, onZoom }: UseCanvasPanArgs) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  // Holding space turns the board into a pannable surface, cards included, and
  // is the main way to pan by hand: every canvas tool works this way, and it
  // leaves the left button free for the cards themselves.
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const gesture = useRef<{ pointerId: number; from: Point; startPan: Point } | null>(null);

  // The viewport is a flex child of a resizable window, so its size is not
  // knowable from props.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /**
   * How much board there is beyond the window. This is the honest measure of
   * "there is more over there", and it is what decides whether a scrollbar is
   * worth showing — unlike `maxPan`, which is inflated by panning slack and so
   * is non-zero even for a board that only just overflows.
   */
  const overflowX = Math.max(0, contentWidth - viewport.width);
  const overflowY = Math.max(0, contentHeight - viewport.height);

  /**
   * How far the board can travel: exactly its overflow, and no further.
   *
   * Any slack past the edge is only ever reachable at the far end of a pan, so
   * it shows up as extra desk on the right and bottom and none on the left or
   * top. Stopping at the edge leaves the board's own padding as the margin, the
   * same on all four sides.
   */
  const maxPanX = overflowX;
  const maxPanY = overflowY;

  const clamp = useCallback(
    (next: Point): Point => ({
      x: Math.min(Math.max(next.x, 0), maxPanX),
      y: Math.min(Math.max(next.y, 0), maxPanY),
    }),
    [maxPanX, maxPanY],
  );

  /**
   * Move the viewport.
   *
   * `bounds` overrides the limits for this one call, for a caller that is
   * changing the zoom in the same tick: the limits derived from props still
   * describe the *old* scale, so a pan computed for the new one would be
   * clipped short and the move would need a second attempt to land.
   */
  const panTo = useCallback(
    (next: Point, bounds?: { maxX: number; maxY: number }) =>
      setPan(
        bounds
          ? {
              x: Math.min(Math.max(next.x, 0), Math.max(0, bounds.maxX)),
              y: Math.min(Math.max(next.y, 0), Math.max(0, bounds.maxY)),
            }
          : clamp(next),
      ),
    [clamp],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => setPan((prev) => clamp({ x: prev.x + dx, y: prev.y + dy })),
    [clamp],
  );

  // Re-clamp when the board shrinks or the window resizes, so a pan that was
  // legal a moment ago cannot strand the viewer past the end of the board.
  useEffect(() => setPan((prev) => clamp(prev)), [clamp]);

  /**
   * Trackpad and wheel panning. Registered by hand because React's onWheel is
   * passive, and a passive listener cannot preventDefault — without which the
   * gesture scrolls the page behind the board instead of moving the board.
   */
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      // Ctrl/Cmd + wheel is the zoom gesture, and it is also what a trackpad
      // pinch sends: the browser reports pinch as a wheel event with ctrlKey
      // set, whether or not ctrl is physically down.
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        onZoom(event.deltaY < 0 ? 'in' : 'out', {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
        return;
      }

      // Holding shift turns a one-axis wheel into horizontal panning, the
      // convention every canvas tool shares. Trackpads send both axes already.
      const horizontal = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
      const vertical = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;
      panBy(horizontal, vertical);
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [panBy, onZoom]);

  // Space is held on the window, not the canvas: the canvas is rarely the
  // focused element, and the gesture has to work wherever the pointer is.
  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isTyping(event.target)) return;
      // Space would otherwise scroll the page and, worse, activate whichever
      // button happens to be focused.
      event.preventDefault();
      setIsSpaceHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setIsSpaceHeld(false);
    };
    // Releasing space while the tab is in the background never fires keyup.
    const onBlur = () => setIsSpaceHeld(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  /**
   * Drag to pan, by middle-click or with space held.
   *
   * A plain left drag deliberately does nothing to the board. Left is the
   * selection button: it belongs to the cards, and to whatever selection and
   * marquee behaviour the board grows later. Reserving it means a left drag can
   * never be ambiguous between "move this card" and "move the board".
   */
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const middleClick = event.button === 1;
      if (!middleClick && !isSpaceHeld) return;

      event.preventDefault();
      gesture.current = {
        pointerId: event.pointerId,
        from: { x: event.clientX, y: event.clientY },
        startPan: pan,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsPanning(true);
    },
    [pan, isSpaceHeld],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      // Dragging the board right moves the viewport left over it, hence the
      // inverted delta: the content follows the hand.
      panTo({
        x: active.startPan.x - (event.clientX - active.from.x),
        y: active.startPan.y - (event.clientY - active.from.y),
      });
    },
    [panTo],
  );

  const endPan = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPanning(false);
  }, []);

  return {
    viewportRef,
    viewport,
    pan,
    panTo,
    panBy,
    isPanning,
    isSpaceHeld,
    maxPanX,
    maxPanY,
    overflowX,
    overflowY,
    panHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPan,
      onPointerCancel: endPan,
    },
  };
}

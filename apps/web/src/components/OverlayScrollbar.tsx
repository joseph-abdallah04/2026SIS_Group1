import { useEffect, useRef, useState, type RefObject } from 'react';

/** Shorter and the thumb is hard to catch with the pointer. */
const MIN_THUMB = 28;
/** How long the thumb stays after the list stops moving. */
const LINGER_MS = 900;

interface Thumb {
  size: number;
  offset: number;
}

/**
 * A slim scrollbar drawn over the edge of a scrolling box, in place of the
 * system's: on Windows that one is a wide grey gutter with arrow buttons,
 * which a narrow panel cannot spare. The box hides its own (`rt-no-scrollbar`)
 * and keeps scrolling as it always did — wheel, trackpad, touch, keys — this
 * only shows where it is, and can be dragged or clicked.
 *
 * Shown while the pointer is over the box or the box is moving, and only when
 * there is something to scroll. A picture of the scroll position, so hidden
 * from screen readers: the box itself is what they scroll.
 *
 * Place it inside a `relative` parent of the box, with `group/scroll` on that
 * parent so hovering the box brings it up.
 */
export function OverlayScrollbar({
  scroller,
  className = '',
}: {
  scroller: RefObject<HTMLElement>;
  /** Where the track sits against the parent. */
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<Thumb | null>(null);
  const [moving, setMoving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; startY: number; startTop: number } | null>(null);

  useEffect(() => {
    const box = scroller.current;
    const track = trackRef.current;
    if (!box || !track) return;

    let frame = 0;
    let linger = 0;
    const measure = () => {
      frame = 0;
      const { scrollHeight, clientHeight, scrollTop } = box;
      const room = track.clientHeight;
      if (scrollHeight <= clientHeight + 1 || room === 0) {
        setThumb(null);
        return;
      }
      const size = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * room);
      const offset = (scrollTop / (scrollHeight - clientHeight)) * (room - size);
      setThumb((current) =>
        current && Math.abs(current.size - size) < 0.5 && Math.abs(current.offset - offset) < 0.5
          ? current
          : { size, offset },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const onScroll = () => {
      schedule();
      setMoving(true);
      window.clearTimeout(linger);
      linger = window.setTimeout(() => setMoving(false), LINGER_MS);
    };

    // The box's own size, and every row in it: a row can grow without the
    // box's children changing (a card opening into a form, a label opening out).
    // (Without ResizeObserver, as in tests, it still follows scrolling.)
    const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const watchRows = () => {
      sizes?.disconnect();
      sizes?.observe(box);
      for (const child of box.children) sizes?.observe(child);
      schedule();
    };
    const rows = new MutationObserver(watchRows);
    rows.observe(box, { childList: true });
    watchRows();
    box.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(linger);
      sizes?.disconnect();
      rows.disconnect();
      box.removeEventListener('scroll', onScroll);
    };
  }, [scroller]);

  const travel = () => {
    const box = scroller.current;
    const room = trackRef.current?.clientHeight ?? 0;
    if (!box || !thumb || room <= thumb.size) return 0;
    return (box.scrollHeight - box.clientHeight) / (room - thumb.size);
  };

  return (
    <div
      ref={trackRef}
      aria-hidden
      // Clicking the track moves a page towards where it was clicked.
      onPointerDown={(event) => {
        const box = scroller.current;
        if (!box || !thumb || event.target !== event.currentTarget) return;
        const at = event.clientY - event.currentTarget.getBoundingClientRect().top;
        const page = box.clientHeight * 0.9;
        box.scrollBy({ top: at < thumb.offset ? -page : page });
      }}
      className={`group/track absolute w-1.5 transition-opacity duration-200 ${
        thumb ? '' : 'pointer-events-none'
      } ${
        thumb && (moving || dragging)
          ? 'opacity-100'
          : thumb
            ? 'opacity-0 group-hover/scroll:opacity-100'
            : 'opacity-0'
      } ${className}`}
    >
      {thumb ? (
        <div
          onPointerDown={(event) => {
            const box = scroller.current;
            if (!box || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              pointerId: event.pointerId,
              startY: event.clientY,
              startTop: box.scrollTop,
            };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const box = scroller.current;
            const started = drag.current;
            if (!box || !started || started.pointerId !== event.pointerId) return;
            box.scrollTop = started.startTop + (event.clientY - started.startY) * travel();
          }}
          onPointerUp={() => {
            drag.current = null;
            setDragging(false);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          style={{ height: thumb.size, transform: `translateY(${thumb.offset}px)` }}
          // Slim at rest, a little wider and darker under the pointer or held.
          className={`absolute right-0 rounded-full transition-[width,background-color] duration-150 ${
            dragging
              ? 'w-1.5 bg-rt-ink/45'
              : 'w-1 bg-rt-ink/25 group-hover/track:w-1.5 group-hover/track:bg-rt-ink/40'
          }`}
        />
      ) : null}
    </div>
  );
}

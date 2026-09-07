import { useRef, useState } from 'react';

/** Never let the thumb shrink to something you cannot grab. */
const MIN_THUMB_PX = 48;

/**
 * How much board has to be off screen before a bar is worth showing, as a
 * fraction of the window. Below this the board is a pan away and the bar is
 * just furniture; above it, there is enough hidden that a viewer needs telling.
 */
const REVEAL_AT_OVERFLOW = 0.5;

interface BoardScrollbarProps {
  orientation: 'horizontal' | 'vertical';
  /** False below 100% zoom, where the board needs no scroll affordance. */
  enabled: boolean;
  /** Visible size of the board viewport along this axis, in pixels. */
  viewportLength: number;
  /** Total size of the board along this axis, in pixels. */
  contentLength: number;
  /** Current pan offset along this axis. */
  pan: number;
  /** Largest legal pan offset along this axis. */
  maxPan: number;
  /** Board length beyond the window: what decides whether the bar appears. */
  overflow: number;
  /** Held visible while a pan is in progress, so it reads as a position gauge. */
  isPanning: boolean;
  onPan: (value: number) => void;
}

/**
 * The board's own scrollbars.
 *
 * The viewport clips rather than scrolls, so there is no native scrollbar to
 * style. These are the only scroll affordance on the canvas, and they exist
 * because a panning canvas hides its own extent: nothing about the view tells
 * you the board continues past the edge of the window.
 *
 * One component drives both axes. The arithmetic is identical once "length"
 * means width or height, and keeping it in one place is what stops the two bars
 * drifting apart in behaviour.
 */
export function BoardScrollbar({
  orientation,
  enabled,
  viewportLength,
  contentLength,
  pan,
  maxPan,
  overflow,
  isPanning,
  onPan,
}: BoardScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; grabOffset: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // A board that merely spills past the edge is a pan away, and a permanent bar
  // for it is noise. A bar earns its place only when magnified, and then only
  // once a serious amount of board is hidden.
  if (!enabled || viewportLength <= 0 || overflow < viewportLength * REVEAL_AT_OVERFLOW) {
    return null;
  }

  const horizontal = orientation === 'horizontal';
  // Both bars stop short of the corner so they never meet and overlap.
  const trackLength = viewportLength - 36;
  const thumbLength = Math.max(
    MIN_THUMB_PX,
    Math.round((viewportLength / contentLength) * trackLength),
  );
  const travel = Math.max(1, trackLength - thumbLength);
  const thumbOffset = (pan / maxPan) * travel;

  const panFromThumb = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), travel);
    onPan((clamped / travel) * maxPan);
  };

  /** Where the pointer sits along the track, whichever axis this bar runs on. */
  const pointerOnTrack = (event: React.PointerEvent<HTMLDivElement>, track: HTMLDivElement) => {
    const rect = track.getBoundingClientRect();
    return horizontal ? event.clientX - rect.left : event.clientY - rect.top;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    // Without this the canvas underneath would start panning as well.
    event.stopPropagation();
    const track = trackRef.current;
    if (!track) return;

    const at = pointerOnTrack(event, track);
    const onThumb = at >= thumbOffset && at <= thumbOffset + thumbLength;

    // Clicking the empty track jumps there, centring the thumb under the
    // pointer; grabbing the thumb keeps the point you took hold of.
    const grabOffset = onThumb ? at - thumbOffset : thumbLength / 2;
    drag.current = { pointerId: event.pointerId, grabOffset };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    panFromThumb(at - grabOffset);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const track = trackRef.current;
    if (!track) return;
    panFromThumb(pointerOnTrack(event, track) - active.grabOffset);
  };

  // A plain function, like the two handlers above it. This sits below the early
  // return, so a hook here would be a conditional hook: on the first render
  // where the board is big enough to scroll, React would see one more hook than
  // the render before and throw.
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  };

  return (
    <div
      ref={trackRef}
      role="scrollbar"
      aria-orientation={orientation}
      aria-label={horizontal ? 'Scroll the board sideways' : 'Scroll the board up and down'}
      aria-valuemin={0}
      aria-valuemax={Math.round(maxPan)}
      aria-valuenow={Math.round(pan)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`group absolute cursor-pointer rounded-full transition-opacity duration-200 hover:opacity-100 ${
        horizontal ? 'bottom-1.5 left-3 h-4' : 'top-3 right-1.5 w-4'
      } ${isPanning || isDragging ? 'opacity-100' : 'opacity-0'}`}
      style={{
        [horizontal ? 'width' : 'height']: trackLength,
        touchAction: 'none',
      }}
    >
      <div
        className={`absolute rounded-full bg-rt-tertiary/25 ${
          horizontal ? 'inset-x-0 top-1.5 h-1' : 'inset-y-0 left-1.5 w-1'
        }`}
      />
      <div
        className={`absolute rounded-full transition-colors ${
          horizontal ? 'top-1.5 h-1' : 'left-1.5 w-1'
        } ${isDragging ? 'bg-rt-primary' : 'bg-rt-ink-faint/50 group-hover:bg-rt-primary/70'}`}
        style={{
          [horizontal ? 'width' : 'height']: thumbLength,
          transform: horizontal ? `translateX(${thumbOffset}px)` : `translateY(${thumbOffset}px)`,
        }}
      />
    </div>
  );
}

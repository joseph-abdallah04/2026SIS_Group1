import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** How long the pointer rests on something before its explanation appears. */
const DELAY_MS = 250;
/** Between the explanation and the thing it explains. */
const GAP_PX = 6;
/** How close to the edge of the window an explanation may sit. */
const EDGE_PX = 8;
/**
 * Room a one-line explanation needs above what it explains, used for the first
 * placement — before the thing has been rendered there is nothing to measure.
 */
const ROOM_PX = 32;

/**
 * What an explanation is made of, and so how it is dressed.
 *
 * A `note` is the dark pill a few words belong on. A `panel` is a light card
 * with a heading and rows in it — reaction names, where the content is a small
 * piece of the interface rather than a phrase, and a dark ground would fight
 * the faces on it.
 */
export type CardTooltipTone = 'note' | 'panel';

const TONE_CLASS: Record<CardTooltipTone, string> = {
  note: 'max-w-[240px] rounded-md bg-rt-ink px-2 py-1 text-[11px] font-medium text-white shadow-lg',
  panel:
    'max-w-[260px] rounded-xl border border-rt-tertiary bg-white px-3 py-2 text-left text-rt-ink shadow-xl',
};

/**
 * Which side each tone opens on, where there is room for either.
 *
 * A note goes above its mark, clear of the byline it sits in. A panel hangs
 * below its chip: the chips already straddle the card's bottom edge, so above
 * is the card itself — the panel would cover the proposal you are reading
 * about — while below is board.
 */
const PREFERS_BELOW: Record<CardTooltipTone, boolean> = { note: false, panel: true };

interface Anchor {
  /** Centre of what is being explained, and its top and bottom edges. */
  x: number;
  top: number;
  bottom: number;
  below: boolean;
  /** Whether the explanation has been measured and fitted to the window. */
  settled: boolean;
}

/**
 * An explanation that appears beside something small on a card.
 *
 * The native `title` waits about a second and is styled by the browser, and the
 * studio's `Tooltip` is positioned inside its parent — which here is a card that
 * clips what spills out of it and is scaled with the board's zoom, so the
 * explanation would be cut off or unreadably small. This one is portalled to
 * the page and placed against the thing on screen, so it reads the same at any
 * zoom.
 *
 * It says nothing to a screen reader: what it explains belongs in the label or
 * in text of its own, where it is there to be read rather than hovered for.
 *
 * Shared by the marks in a card's byline and the reaction chips along its
 * bottom edge, so both explain themselves the same way.
 */
export function useCardTooltip<T extends HTMLElement>(
  content: ReactNode,
  tone: CardTooltipTone = 'note',
) {
  const ref = useRef<T>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setAnchor(null);
  };

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      // Its own side, unless the window edge is right there — a card near the
      // top of the board, or a chip near the bottom — in which case the other.
      const prefersBelow = PREFERS_BELOW[tone];
      setAnchor({
        x: rect.left + rect.width / 2,
        top: rect.top,
        bottom: rect.bottom,
        below: prefersBelow ? window.innerHeight - rect.bottom > ROOM_PX : rect.top < ROOM_PX,
        settled: false,
      });
    }, DELAY_MS);
  };

  // Fitted to the window once it is on screen, before the browser paints it.
  //
  // Measured rather than guessed, because these are no longer all one size: a
  // panel naming everyone in a chip is many times the height of the pill this
  // started as, and a chip with room above it for one line can have none for
  // six.
  useLayoutEffect(() => {
    if (!anchor || anchor.settled) return;
    const box = tip.current?.getBoundingClientRect();
    if (!box) return;
    const roomAbove = anchor.top - GAP_PX - EDGE_PX;
    const roomBelow = window.innerHeight - anchor.bottom - GAP_PX - EDGE_PX;
    // Its own side while it fits there, then whichever side has more room.
    const below = PREFERS_BELOW[tone]
      ? box.height <= roomBelow || roomBelow >= roomAbove
      : box.height > roomAbove && roomBelow > roomAbove;
    // Centred on what it explains, until that would hang it off the side.
    const half = box.width / 2;
    const x = Math.min(Math.max(anchor.x, EDGE_PX + half), window.innerWidth - EDGE_PX - half);
    setAnchor({ ...anchor, x, below, settled: true });
  }, [anchor, tone]);

  useEffect(() => {
    if (!anchor) return;
    // The board pans under a wheel, which moves what this explains out from
    // under an explanation placed once.
    window.addEventListener('wheel', hide, { passive: true });
    return () => window.removeEventListener('wheel', hide);
  }, [anchor]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const tooltip: ReactNode =
    anchor && content
      ? createPortal(
          // A div rather than a span: a panel holds a heading and a list, and
          // neither may sit inside phrasing content.
          <div
            ref={tip}
            role="presentation"
            aria-hidden="true"
            className={`rt-studio-fade pointer-events-none fixed z-50 ${TONE_CLASS[tone]}`}
            data-placement={anchor.below ? 'below' : 'above'}
            style={{
              left: anchor.x,
              top: anchor.below ? anchor.bottom + GAP_PX : anchor.top - GAP_PX,
              transform: anchor.below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
            }}
          >
            {content}
          </div>,
          document.body,
        )
      : null;

  return {
    /** Spread onto whatever the explanation is about. */
    anchor: {
      ref,
      onPointerEnter: show,
      onPointerLeave: hide,
      // Picking the card up, or pressing the chip, is not reading about it.
      onPointerDown: hide,
      onFocus: show,
      onBlur: hide,
    },
    tooltip,
  };
}

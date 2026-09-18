import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** How long the pointer rests on something before its explanation appears. */
const DELAY_MS = 250;
/** Room a tooltip needs above what it explains: its height and the gap, with a little over. */
const ROOM_PX = 32;

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
export function useCardTooltip<T extends HTMLElement>(text: string) {
  const ref = useRef<T>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; below: boolean } | null>(null);

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setAnchor(null);
  };

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      // Above it, unless that would put the tooltip off the top of the window —
      // a card near the top edge of the board — in which case below it.
      const below = rect.top < ROOM_PX;
      setAnchor({ x: rect.left + rect.width / 2, y: below ? rect.bottom : rect.top, below });
    }, DELAY_MS);
  };

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
    anchor && text
      ? createPortal(
          <span
            role="presentation"
            aria-hidden="true"
            className="rt-studio-fade pointer-events-none fixed z-50 max-w-[240px] rounded-md bg-rt-ink px-2 py-1 text-[11px] font-medium text-white shadow-lg"
            data-placement={anchor.below ? 'below' : 'above'}
            style={{
              left: anchor.x,
              top: anchor.below ? anchor.y + 6 : anchor.y - 6,
              transform: anchor.below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
            }}
          >
            {text}
          </span>,
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

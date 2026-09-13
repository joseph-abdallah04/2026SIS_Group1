import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** Breathing room from the trigger, and from the edge of the window. */
const GAP = 8;

interface AnchoredPopoverProps {
  /** Where the trigger sits in viewport coordinates, from `getBoundingClientRect`. */
  anchor: DOMRect;
  /** Fixed, so the placement can be decided before the panel renders. */
  width: number;
  /**
   * The tallest the panel may become. Used for the flip decision as well as the
   * cap, so a panel that grows with its content still lands somewhere sensible.
   */
  maxHeight: number;
  /** Names the dialog for screen readers. */
  label: string;
  onClose: () => void;
  /**
   * The trigger, exempted from the outside-press check.
   *
   * Without it a trigger that toggles cannot close its own panel: this handler
   * runs on `pointerdown` in the capture phase, so it closes the panel first,
   * and the `click` that follows re-opens it. The panel would still be
   * dismissable by Escape or by pressing elsewhere, which is exactly why the
   * fault survives casual testing.
   */
  ignore?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * Place the panel: below the trigger when there is room, above it when there is
 * not, and always inside the window horizontally.
 */
function placePanel(
  anchor: DOMRect,
  width: number,
  maxHeight: number,
): { top: number; left: number } {
  const below = anchor.bottom + GAP;
  const fitsBelow = below + maxHeight <= window.innerHeight - GAP;
  const top = fitsBelow ? below : Math.max(GAP, anchor.top - GAP - maxHeight);

  const preferred = anchor.left + anchor.width / 2 - width / 2;
  const left = Math.min(Math.max(preferred, GAP), window.innerWidth - width - GAP);

  return { top, left };
}

/**
 * A panel pinned to a trigger, dismissed the way people expect.
 *
 * Portalled to `document.body` rather than left where it was written: anything
 * inside the board sits under the canvas's scale transform, and a transformed
 * ancestor becomes the containing block for its descendants — so a `fixed`
 * panel left in place would inherit the board's zoom and position itself
 * against a card instead of the window. Portalling also takes it out of the
 * header's stacking context, which is what lets it paint over the board.
 *
 * It deliberately does not close on an outside wheel, which `EmojiPicker` does:
 * that trigger rides the panning board, so scrolling moves it out from under a
 * position measured once. A trigger in fixed chrome does not move, and closing
 * the panel because someone scrolled the board behind it would be a surprise.
 * Add it back behind a prop the day a caller needs it.
 *
 * The placement and dismissal here are lifted from `pinboard/EmojiPicker`,
 * which proved them; that component predates this one and still carries its own
 * copy, as does `sessions/SessionCardActions`. Either could adopt this, but
 * both belong to other modules and neither is this branch's to change.
 */
export function AnchoredPopover({
  anchor,
  width,
  maxHeight,
  label,
  onClose,
  ignore,
  children,
}: AnchoredPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Measured once, on open. Re-measuring as the content grows would make the
  // panel walk up the screen while somebody is reading it.
  const [position] = useState(() => placePanel(anchor, width, maxHeight));

  useEffect(() => {
    // Remembered before focus moves, so closing puts the keyboard back where it
    // was rather than at the top of the document.
    const previous = document.activeElement;
    panelRef.current?.focus();

    const outside = (target: EventTarget | null) => {
      const node = target as Node | null;
      if (panelRef.current?.contains(node)) return false;
      if (ignore?.current?.contains(node)) return false;
      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // One press closes one thing: other Escape handlers are listening too.
      event.stopPropagation();
      onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (outside(event.target)) onClose();
    };
    // A resize moves the trigger, and the position above was measured once.
    const onResize = () => onClose();

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onResize);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose, ignore]);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-rt-tertiary bg-rt-surface shadow-lg focus-visible:outline-none"
      style={{ top: position.top, left: position.left, width, maxHeight }}
    >
      {children}
    </div>,
    document.body,
  );
}

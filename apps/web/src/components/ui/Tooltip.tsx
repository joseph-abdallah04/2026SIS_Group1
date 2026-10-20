import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type TooltipPlacement = 'top' | 'right' | 'bottom' | 'left';

const PLACEMENT_CLASSES: Record<TooltipPlacement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  // For controls on the screen's right edge, where `right` would leave it.
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
};

/** The gap between a portalled bubble and its control, as `mt-1.5` and friends give. */
const GAP = 6;
/** The least room a portalled bubble keeps from the window's edge. */
const EDGE = 8;

/**
 * Where a portalled bubble goes: beside its control as `placement` says, then
 * slid back inside the window if that would take it over an edge.
 */
export function portalPosition(
  trigger: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width' | 'height'>,
  bubble: { width: number; height: number },
  placement: TooltipPlacement,
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const centreX = trigger.left + trigger.width / 2 - bubble.width / 2;
  const centreY = trigger.top + trigger.height / 2 - bubble.height / 2;
  const spot = {
    top: { left: centreX, top: trigger.top - GAP - bubble.height },
    bottom: { left: centreX, top: trigger.bottom + GAP },
    right: { left: trigger.right + GAP, top: centreY },
    left: { left: trigger.left - GAP - bubble.width, top: centreY },
  }[placement];
  const clamp = (value: number, size: number, room: number) =>
    Math.max(EDGE, Math.min(value, room - size - EDGE));
  return {
    left: clamp(spot.left, bubble.width, viewport.width),
    top: clamp(spot.top, bubble.height, viewport.height),
  };
}

interface TooltipProps {
  /** What the control does. Kept short: this is a label, not a sentence. */
  label: string;
  /** Shown as a key chip beside the label, so shortcuts are learnt in passing. */
  shortcut?: string;
  placement?: TooltipPlacement;
  /**
   * Draw the bubble on the page itself rather than beside the control, for a
   * control inside something that scrolls or clips (the lobby's info card),
   * where the bubble would be cut off and add a scrollbar. Kept within the
   * window. Not for anything inside a modal `<dialog>`: that sits above the
   * page, so the bubble would be hidden under it.
   */
  portal?: boolean;
  children: ReactNode;
}

/**
 * A tooltip for icon-only controls: the studio's toolbars and the side panel's
 * strip.
 *
 * The native `title` cannot do this job: it waits about a second, cannot render
 * a key chip, and is styled by the browser. This opens quickly, on focus as well
 * as hover so a keyboard user gets it too, and is `aria-hidden` — the control it
 * wraps still carries its own accessible name, and a screen reader should hear
 * that name once rather than twice.
 *
 * Touch has no hover at all, which is why the shortcut sheet exists alongside
 * this rather than instead of it.
 */
export function Tooltip({
  label,
  shortcut,
  placement = 'right',
  portal = false,
  children,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const id = useId();

  function clearTimer() {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
  }

  useEffect(() => clearTimer, []);

  function show() {
    clearTimer();
    // Short enough to feel immediate, long enough not to flash while the
    // pointer crosses the rail on its way somewhere else.
    timer.current = setTimeout(() => setOpen(true), 250);
  }

  function hide() {
    clearTimer();
    setOpen(false);
    setPosition(null);
  }

  // A portalled bubble is placed once it can be measured, before it is
  // painted, and again if its words change size while it is up ("Copy" to
  // "Copied"). It goes as soon as anything moves under it: placed for where
  // the control was, it would otherwise hang in the wrong spot.
  useLayoutEffect(() => {
    if (!portal || !open || !anchor.current || !bubble.current) return;
    const box = bubble.current.getBoundingClientRect();
    setPosition(
      portalPosition(
        anchor.current.getBoundingClientRect(),
        { width: box.width, height: box.height },
        placement,
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [portal, open, placement, label, shortcut]);

  useEffect(() => {
    if (!portal || !open) return;
    const close = () => {
      clearTimer();
      setOpen(false);
      setPosition(null);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [portal, open]);

  const tip = open ? (
    <span
      ref={bubble}
      id={id}
      role="presentation"
      aria-hidden="true"
      style={
        portal
          ? {
              left: position?.left ?? 0,
              top: position?.top ?? 0,
              visibility: position ? undefined : 'hidden',
            }
          : undefined
      }
      className={`rt-studio-fade pointer-events-none z-50 flex items-center gap-1.5 rounded-md bg-rt-ink px-2 py-1 text-[11px] font-medium whitespace-nowrap text-white shadow-lg ${
        portal ? 'fixed' : `absolute ${PLACEMENT_CLASSES[placement]}`
      }`}
    >
      {label}
      {shortcut ? (
        <kbd className="rounded border border-white/25 bg-white/10 px-1 font-sans text-[10px] text-white/90">
          {shortcut}
        </kbd>
      ) : null}
    </span>
  ) : null;

  return (
    <span
      ref={anchor}
      className="relative inline-flex"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
      // A tooltip must never survive the thing it describes being pressed.
      onPointerDown={hide}
    >
      {children}
      {portal && tip ? createPortal(tip, document.body) : tip}
    </span>
  );
}

import { useId, useRef, useState, type ReactNode } from 'react';

type TooltipPlacement = 'top' | 'right' | 'bottom';

const PLACEMENT_CLASSES: Record<TooltipPlacement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
};

interface TooltipProps {
  /** What the control does. Kept short: this is a label, not a sentence. */
  label: string;
  /** Shown as a key chip beside the label, so shortcuts are learnt in passing. */
  shortcut?: string;
  placement?: TooltipPlacement;
  children: ReactNode;
}

/**
 * A tooltip for the studio's icon-only toolbars.
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
export function Tooltip({ label, shortcut, placement = 'right', children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  function show() {
    if (timer.current) clearTimeout(timer.current);
    // Short enough to feel immediate, long enough not to flash while the
    // pointer crosses the rail on its way somewhere else.
    timer.current = setTimeout(() => setOpen(true), 250);
  }

  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
      // A tooltip must never survive the thing it describes being pressed.
      onPointerDown={hide}
    >
      {children}
      {open ? (
        <span
          id={id}
          role="presentation"
          aria-hidden="true"
          className={`pointer-events-none absolute z-50 flex items-center gap-1.5 rounded-md bg-rt-ink px-2 py-1 text-[11px] font-medium whitespace-nowrap text-white shadow-lg ${PLACEMENT_CLASSES[placement]}`}
        >
          {label}
          {shortcut ? (
            <kbd className="rounded border border-white/25 bg-white/10 px-1 font-sans text-[10px] text-white/90">
              {shortcut}
            </kbd>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

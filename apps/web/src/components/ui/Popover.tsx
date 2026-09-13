import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type PopoverPlacement =
  | 'right'
  | 'right-center'
  | 'top'
  | 'top-center'
  | 'top-end'
  | 'bottom'
  | 'bottom-center'
  | 'bottom-end';

const PLACEMENT_CLASSES: Record<PopoverPlacement, string> = {
  right: 'left-full top-0 ml-2',
  // Held level with the middle of its anchor rather than its top.
  'right-center': 'left-full top-1/2 ml-2 -translate-y-1/2',
  top: 'bottom-full left-0 mb-2',
  // Held over the middle of its anchor rather than its left edge.
  'top-center': 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  // Right edges aligned: for an anchor already against the edge of the canvas,
  // where centring would push the panel off it.
  'top-end': 'right-0 bottom-full mb-2',
  bottom: 'top-full left-0 mt-2',
  'bottom-center': 'top-full left-1/2 mt-2 -translate-x-1/2',
  // Right edges aligned, below: for an anchor in the top-right corner, where
  // opening upward would put the panel off the top of the canvas.
  'bottom-end': 'top-full right-0 mt-2',
};

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** Named for the screen reader, since the trigger is an icon. */
  label: string;
  placement?: PopoverPlacement;
  /**
   * An explicit width. Without one the panel is `w-max`: content inside it must
   * not size itself, since `fit-content` on a child of a shrink-to-fit absolute
   * box resolves against a width that is not settled yet, and collapses.
   */
  width?: string;
  /** The control that opened it; focus goes back here on close. */
  triggerRef: React.RefObject<HTMLElement | null>;
  /**
   * Whether a press outside closes it. A tool's own settings stay open while
   * that tool is being used — closing the ink panel the moment a stroke starts
   * would mean reopening it between every stroke — and are dismissed by Escape,
   * by the trigger, or by choosing another tool instead.
   */
  dismissOnOutsidePress?: boolean;
  children: ReactNode;
}

/** Where a panel goes when the side it asked for has no room. */
const FLIPPED: Partial<Record<PopoverPlacement, PopoverPlacement>> = {
  top: 'bottom',
  'top-center': 'bottom-center',
  'top-end': 'bottom-end',
  bottom: 'top',
  'bottom-center': 'top-center',
  'bottom-end': 'top-end',
};

/**
 * A sub-toolbar anchored to the control that opened it.
 *
 * Opened by click and closed by click-away, Escape, or the caller (a tool or
 * selection change makes an open sub-toolbar stale). Deliberately not
 * hover-opened: hover has no touch equivalent and fires constantly while the
 * pointer crosses a toolbar on its way somewhere else.
 *
 * Focus returns to the trigger on close, so keyboard users are not dropped back
 * at the top of the document.
 */
export function Popover({
  open,
  onClose,
  label,
  placement = 'right',
  width,
  triggerRef,
  dismissOnOutsidePress = true,
  children,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);

  /**
   * Flip to the other side of the trigger when the asked-for side has no room.
   *
   * Placement is otherwise pure CSS, which cannot know how tall the panel turns
   * out to be — so a tall panel above a control near the top of the screen
   * opened off the top of the window, where it read as an empty menu.
   *
   * The decision is made from the trigger and the panel's own height, never
   * from where the panel currently sits: measuring its position would let the
   * flipped panel re-measure, disagree, and flip back on every frame.
   */
  useLayoutEffect(() => {
    if (!open) {
      setFlipped(false);
      return;
    }
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!panel || !trigger) return;

    const wants = placement.startsWith('top')
      ? 'top'
      : placement.startsWith('bottom')
        ? 'bottom'
        : null;
    if (!wants || !FLIPPED[placement]) return;

    const anchor = trigger.getBoundingClientRect();
    const needed = panel.offsetHeight + 8;
    const room = wants === 'top' ? anchor.top : window.innerHeight - anchor.bottom;
    const roomOpposite = wants === 'top' ? window.innerHeight - anchor.bottom : anchor.top;
    // Only flip when the other side is actually better, so a panel too tall for
    // either side stays where it was asked to go.
    setFlipped(needed > room && roomOpposite > room);
  }, [open, placement, triggerRef, children]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!dismissOnOutsidePress) return;
      const target = event.target as Node;
      // A press on the trigger is the trigger's own business: letting this
      // close it too would make the second click reopen it immediately.
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      // The studio is a native `<dialog>`, so Escape is a close request: the
      // browser fires `cancel` on it and the whole editor shuts. Stopping the
      // keydown does not reach that — only preventing its default does. Without
      // this, dismissing any sub-toolbar took the canvas down with it.
      event.preventDefault();
      event.stopPropagation();
      onClose();
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, onClose, triggerRef, dismissOnOutsidePress]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label={label}
      className={`rt-studio-fade absolute z-30 w-max rounded-xl border border-rt-tertiary bg-rt-surface p-1.5 shadow-[0_8px_30px_rgba(8,12,21,0.16)] ${PLACEMENT_CLASSES[(flipped && FLIPPED[placement]) || placement]} ${width ?? ''}`}
    >
      {children}
    </div>
  );
}

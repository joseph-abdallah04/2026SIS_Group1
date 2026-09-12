import { useEffect, useRef, type ReactNode } from 'react';

type PopoverPlacement =
  'right' | 'right-center' | 'top' | 'top-center' | 'top-end' | 'bottom' | 'bottom-end';

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
      className={`rt-studio-fade absolute z-30 w-max rounded-xl border border-rt-tertiary bg-rt-surface p-1.5 shadow-[0_8px_30px_rgba(8,12,21,0.16)] ${PLACEMENT_CLASSES[placement]} ${width ?? ''}`}
    >
      {children}
    </div>
  );
}

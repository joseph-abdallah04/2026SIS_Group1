import { useEffect, useRef, type ReactNode } from 'react';

type PopoverPlacement = 'right' | 'top' | 'bottom';

const PLACEMENT_CLASSES: Record<PopoverPlacement, string> = {
  right: 'left-full top-0 ml-2',
  top: 'bottom-full left-0 mb-2',
  bottom: 'top-full left-0 mt-2',
};

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** Named for the screen reader, since the trigger is an icon. */
  label: string;
  placement?: PopoverPlacement;
  /** A width for the panel; without one it sizes to its contents. */
  width?: string;
  /** The control that opened it; focus goes back here on close. */
  triggerRef: React.RefObject<HTMLElement | null>;
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
  children,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
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
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label={label}
      className={`absolute z-30 rounded-xl border border-rt-tertiary bg-rt-surface p-2 shadow-[0_8px_30px_rgba(8,12,21,0.16)] ${PLACEMENT_CLASSES[placement]} ${width ?? ''}`}
    >
      {children}
    </div>
  );
}

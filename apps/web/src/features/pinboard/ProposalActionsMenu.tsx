import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

/** Breathing room from the edge of the window. */
const GAP = 8;

export interface ProposalMenuItem {
  /** Stable identity, also used as the React key. */
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Tints the row red: removal should not look like every other action. */
  destructive?: boolean;
  /**
   * Shown but not actionable. Only for something that is coming, not for
   * something this viewer may not do — that is hidden instead, so the menu
   * never lists actions somebody has no way of taking.
   */
  disabled?: boolean;
  /** A short note at the row's right edge, such as "Soon" beside a placeholder. */
  hint?: string;
}

/**
 * Where the menu opens from.
 *
 * A right-click opens at the pointer, the way every desktop context menu does.
 * The ⋯ button opens the menu in its own place: its top-left corner at the
 * given point (the button's left edge, level with the top of the card), so it
 * reads as the button unfolding rather than a popup appearing somewhere else.
 */
export type ProposalMenuAnchor =
  { kind: 'point'; x: number; y: number } | { kind: 'corner'; left: number; top: number };

interface ProposalActionsMenuProps {
  anchor: ProposalMenuAnchor;
  /** Groups of items, drawn with a rule between each. Empty groups are dropped. */
  sections: ProposalMenuItem[][];
  /** Names the menu for screen readers. */
  label: string;
  onClose: () => void;
  /**
   * The ⋯ button, exempted from the outside-press check so pressing it again
   * closes the menu rather than closing and immediately reopening it. The same
   * reason `AnchoredPopover` takes one.
   */
  ignore?: RefObject<HTMLElement | null>;
}

/** Put the menu where it was asked for, then pull it back inside the window. */
function placeMenu(anchor: ProposalMenuAnchor, width: number, height: number) {
  const maxLeft = window.innerWidth - width - GAP;
  const maxTop = window.innerHeight - height - GAP;

  let left: number;
  let top: number;
  if (anchor.kind === 'point') {
    // Opening leftward or upward past an edge, rather than sliding along it,
    // keeps the pointer on the menu's corner, which is where people look for it.
    left = anchor.x + width > window.innerWidth - GAP ? anchor.x - width : anchor.x;
    top = anchor.y + height > window.innerHeight - GAP ? anchor.y - height : anchor.y;
  } else {
    // Exactly where asked; the clamp below slides it back inside the window
    // when the card sits near an edge, rather than flipping it away from the
    // card it belongs to.
    left = anchor.left;
    top = anchor.top;
  }

  // A trigger measured mid-unmount can report an empty rect; land in the
  // corner rather than writing NaN into the style.
  const clamp = (value: number, max: number) =>
    Number.isFinite(value) ? Math.max(GAP, Math.min(value, max)) : GAP;
  return { left: clamp(left, maxLeft), top: clamp(top, maxTop) };
}

/**
 * The actions on one proposal card, opened by right-clicking it or from its ⋯
 * button. One component for both, so the two ways in can never offer
 * different things.
 *
 * Portalled to `document.body` for the reason `AnchoredPopover` gives: a card
 * sits under the canvas's scale transform, and a `fixed` menu left inside it
 * would take the board's zoom and position itself against the card.
 *
 * Closes the way `EmojiPicker` does, wheel included: its trigger rides the
 * panning board, and a wheel over the board moves the card out from under a
 * menu whose position was measured once.
 */
export function ProposalActionsMenu({
  anchor,
  sections,
  label,
  onClose,
  ignore,
}: ProposalActionsMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Null until measured: the menu's height depends on which items this viewer
  // gets, so it is placed after layout and before paint, never guessed.
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const groups = sections.filter((section) => section.length > 0);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    setPosition(placeMenu(anchor, panel.offsetWidth, panel.offsetHeight));
    // Placed when the menu opens and again whenever the card opens it from
    // somewhere new — a second right-click, or the Menu key — which it does by
    // handing over a new anchor. Never as the board pans: the anchor does not
    // change then, and a menu that followed the board would walk off its card.
  }, [anchor]);

  const enabledItems = () =>
    Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );

  useEffect(() => {
    // Remembered before focus moves, so closing puts the keyboard back where it
    // was rather than at the top of the document.
    const previous = document.activeElement;
    // The first thing you can actually do, so Enter straight away does it.
    (enabledItems()[0] ?? panelRef.current)?.focus();

    const outside = (target: EventTarget | null) => {
      const node = target as Node | null;
      if (panelRef.current?.contains(node)) return false;
      if (ignore?.current?.contains(node)) return false;
      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // One press closes one thing: the inline sticky editor listens for it too.
      event.stopPropagation();
      onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (outside(event.target)) onClose();
    };
    // The Menu key and Shift+F10 open another card's menu without any press to
    // close this one first, which would leave two open at once. Heard before
    // the card's own handler, so on the card this menu belongs to it closes
    // and that handler opens it again at the new spot in the same update.
    const onContextMenu = (event: MouseEvent) => {
      if (outside(event.target)) onClose();
    };
    const onWheel = (event: WheelEvent) => {
      if (outside(event.target)) onClose();
    };
    const onResize = () => onClose();

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      if (previous instanceof HTMLElement) previous.focus();
    };
    // `onClose` must be stable (a `useCallback` in the card): a new one each
    // render would re-run this and pull focus back to the first item.
  }, [onClose, ignore]);

  /** Arrow keys walk the items, wrapping at either end, as native menus do. */
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = enabledItems();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
    if (event.key === 'ArrowUp') next = current <= 0 ? items.length - 1 : current - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = items.length - 1;
    if (next !== null) {
      event.preventDefault();
      items[next]?.focus();
      return;
    }
    // A menu is one stop in the tab order: leaving it closes it.
    if (event.key === 'Tab') {
      event.preventDefault();
      onClose();
    }
  };

  /**
   * React events bubble through a portal to the card that rendered it. Kept
   * here, a press in the menu would reach the card's drag and shortlist
   * handlers, and a right-click in it would reopen the menu under the pointer.
   */
  const contain = (event: SyntheticEvent) => event.stopPropagation();

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onMenuKeyDown}
      onPointerDown={contain}
      onClick={contain}
      onDoubleClick={contain}
      onContextMenu={(event) => {
        // No browser menu on top of this one.
        event.preventDefault();
        event.stopPropagation();
      }}
      className="fixed z-50 min-w-44 overflow-hidden rounded-2xl border border-rt-tertiary bg-white py-1 shadow-lg focus-visible:outline-none"
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        // Laid out invisibly for the one measurement, never painted unplaced.
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {groups.map((group, index) => (
        <Fragment key={group[0]?.id ?? index}>
          {index > 0 ? <div role="separator" className="mx-2 my-1 h-px bg-rt-tertiary" /> : null}
          {group.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                aria-disabled={item.disabled ? 'true' : undefined}
                onClick={() => {
                  if (item.disabled) return;
                  onClose();
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] font-semibold focus-visible:outline-none ${
                  item.disabled
                    ? 'cursor-default text-rt-ink-faint'
                    : item.destructive
                      ? 'text-red-600 hover:bg-red-50 focus-visible:bg-red-50'
                      : 'text-rt-ink hover:bg-rt-primary-tint focus-visible:bg-rt-primary-tint'
                }`}
              >
                <Icon aria-hidden="true" size={14} strokeWidth={2} className="shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.hint ? (
                  <span className="text-[10.5px] font-medium text-rt-ink-faint">{item.hint}</span>
                ) : null}
              </button>
            );
          })}
        </Fragment>
      ))}
    </div>,
    document.body,
  );
}

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
import { ChevronRight, type LucideIcon } from 'lucide-react';

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
  /**
   * Choices one level down, such as the formats Export offers. The row then
   * opens them rather than doing anything itself, and its `onSelect` is not
   * called. One level only.
   */
  submenu?: ProposalMenuItem[];
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

/**
 * Where a right-click on a card opens its menu, or null to leave the browser's
 * own menu alone.
 *
 * The browser's menu stays over anything in the card that takes text of its
 * own, and over a link in a sticky, where opening it in a new tab or copying
 * its address is what a right-click is for. The Menu key and Shift+F10 fire
 * this too, from whatever is focused inside the card and with no pointer
 * position, so the menu opens where the ⋯ would open it instead of in the
 * window's corner.
 */
export function contextMenuAnchor(
  event: React.MouseEvent<HTMLElement>,
  cornerAnchor: () => ProposalMenuAnchor | null,
): ProposalMenuAnchor | null {
  const target = event.target as HTMLElement;
  if (target.closest('textarea, input, [contenteditable="true"], a[href]')) return null;
  const fromKeyboard = event.clientX === 0 && event.clientY === 0;
  if (!fromKeyboard) return { kind: 'point', x: event.clientX, y: event.clientY };
  const rect = event.currentTarget.getBoundingClientRect();
  return cornerAnchor() ?? { kind: 'corner', left: rect.right, top: rect.top };
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
 * Where a submenu opens: beside the row that opened it, its first item level
 * with that row, on whichever side the window has room for it.
 */
function placeSubmenu(row: DOMRect, width: number, height: number) {
  // The panels' own padding, so the submenu's first row sits level with the
  // row it came from and its edge just overlaps the menu's.
  const inset = 4;
  const rightward = row.right - inset;
  const left = rightward + width > window.innerWidth - GAP ? row.left - width + inset : rightward;
  const clamp = (value: number, max: number) =>
    Number.isFinite(value) ? Math.max(GAP, Math.min(value, max)) : GAP;
  return {
    left: clamp(left, window.innerWidth - width - GAP),
    top: clamp(row.top - inset, window.innerHeight - height - GAP),
  };
}

/**
 * How long an open submenu waits after the pointer moves onto another row
 * before it closes: long enough to cross a row or two on the way to it, short
 * enough that moving on to a different action does not leave it hanging.
 */
export const SUBMENU_GRACE_MS = 300;

const PANEL_CLASS =
  'fixed z-50 min-w-44 overflow-hidden rounded-2xl border border-rt-tertiary bg-white py-1 shadow-lg focus-visible:outline-none';

/** The menu items in a panel that can be pressed, in order. */
function enabledIn(panel: HTMLElement | null): HTMLButtonElement[] {
  return Array.from(
    panel?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([aria-disabled="true"])') ??
      [],
  );
}

/** Arrow keys, Home and End walk a panel's items, wrapping at either end, as native menus do. */
function walk(event: ReactKeyboardEvent<HTMLDivElement>, items: HTMLButtonElement[]): boolean {
  if (items.length === 0) return false;
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  let next: number | null = null;
  if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
  if (event.key === 'ArrowUp') next = current <= 0 ? items.length - 1 : current - 1;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = items.length - 1;
  if (next === null) return false;
  event.preventDefault();
  items[next]?.focus();
  return true;
}

/**
 * The actions on one proposal card, opened by right-clicking it or from its ⋯
 * button. One component for both, so the two ways in can never offer
 * different things.
 *
 * A row can hold a submenu of its own — Export's formats — so the menu itself
 * stays one short list of things to do, and the choices that only matter once
 * one of them is picked wait a level down. A submenu opens on hover, a press,
 * or the right arrow, and closes on the left arrow or Escape, back to its row.
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
  const subRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  // Null until measured: the menu's height depends on which items this viewer
  // gets, so it is placed after layout and before paint, never guessed.
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  /**
   * The row whose submenu is open, and whether its first item takes the focus:
   * it does when opened from the keyboard or by a press, not when the pointer
   * merely passes over the row on its way somewhere else.
   */
  const [open, setOpen] = useState<{ id: string; focus: boolean } | null>(null);
  const [subPosition, setSubPosition] = useState<{ top: number; left: number } | null>(null);
  const groups = sections.filter((section) => section.length > 0);
  const parent = open
    ? groups.flat().find((item) => item.id === open.id && (item.submenu?.length ?? 0) > 0)
    : undefined;
  const parentId = parent?.id;
  // Read by the document's listeners, which are attached once.
  const openRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    openRef.current = parentId;
  });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    setPosition(placeMenu(anchor, panel.offsetWidth, panel.offsetHeight));
    // Placed when the menu opens and again whenever the card opens it from
    // somewhere new — a second right-click, or the Menu key — which it does by
    // handing over a new anchor. Never as the board pans: the anchor does not
    // change then, and a menu that followed the board would walk off its card.
  }, [anchor]);

  useLayoutEffect(() => {
    const row = parentId ? rowRefs.current.get(parentId) : undefined;
    const panel = subRef.current;
    if (!row || !panel || !position) {
      setSubPosition(null);
      return;
    }
    setSubPosition(
      placeSubmenu(row.getBoundingClientRect(), panel.offsetWidth, panel.offsetHeight),
    );
  }, [parentId, position]);

  // Into the submenu once it is placed: focus cannot land on a panel that is
  // still laid out invisibly for its measurement.
  const focusSubmenu = open?.focus ?? false;
  useEffect(() => {
    if (focusSubmenu && subPosition) enabledIn(subRef.current)[0]?.focus();
  }, [focusSubmenu, subPosition]);

  /** Put the submenu away, and the keyboard back on the row that opened it. */
  const closeSubmenu = () => {
    const row = openRef.current ? rowRefs.current.get(openRef.current) : undefined;
    setOpen(null);
    row?.focus();
  };
  const closeSubmenuRef = useRef(closeSubmenu);
  useEffect(() => {
    closeSubmenuRef.current = closeSubmenu;
  });

  /**
   * A pending close of the submenu, from the pointer passing over another row.
   *
   * The way from a row to its submenu's lower items runs diagonally, across
   * the rows beneath it. Shutting the submenu the moment one of them is
   * crossed took it away from under the pointer on its way in; waiting a beat
   * lets it arrive, and reaching the submenu, or coming back to its row,
   * calls the close off.
   */
  const graceTimer = useRef<number | null>(null);
  const cancelGrace = () => {
    if (graceTimer.current === null) return;
    window.clearTimeout(graceTimer.current);
    graceTimer.current = null;
  };
  useEffect(() => cancelGrace, []);

  useEffect(() => {
    // Remembered before focus moves, so closing puts the keyboard back where it
    // was rather than at the top of the document.
    const previous = document.activeElement;
    // The first thing you can actually do, so Enter straight away does it.
    (enabledIn(panelRef.current)[0] ?? panelRef.current)?.focus();

    const outside = (target: EventTarget | null) => {
      const node = target as Node | null;
      if (panelRef.current?.contains(node)) return false;
      if (subRef.current?.contains(node)) return false;
      if (ignore?.current?.contains(node)) return false;
      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // One press closes one thing: the inline sticky editor listens for it
      // too, and an open submenu goes before the menu it came from.
      event.stopPropagation();
      if (openRef.current) {
        closeSubmenuRef.current();
        return;
      }
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

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (walk(event, enabledIn(panelRef.current))) return;
    // Into a row's submenu, the way its chevron points.
    if (event.key === 'ArrowRight') {
      const id = (document.activeElement as HTMLElement | null)?.dataset.menuId;
      const item = id ? groups.flat().find((candidate) => candidate.id === id) : undefined;
      if (item?.submenu?.length && !item.disabled) {
        event.preventDefault();
        setOpen({ id: item.id, focus: true });
      }
      return;
    }
    // A menu is one stop in the tab order: leaving it closes it.
    if (event.key === 'Tab') {
      event.preventDefault();
      onClose();
    }
  };

  const onSubmenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (walk(event, enabledIn(subRef.current))) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      closeSubmenu();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      onClose();
    }
  };

  /**
   * React events bubble through a portal to the card that rendered it. Kept
   * here, a press in the menu would reach the card's drag, selection and
   * shortlist handlers, and a right-click in it would reopen the menu under
   * the pointer. Both panels hold them, the submenu as much as the menu.
   */
  const contain = {
    onPointerDown: (event: SyntheticEvent) => event.stopPropagation(),
    onClick: (event: SyntheticEvent) => event.stopPropagation(),
    onDoubleClick: (event: SyntheticEvent) => event.stopPropagation(),
    onContextMenu: (event: SyntheticEvent) => {
      // No browser menu on top of this one.
      event.preventDefault();
      event.stopPropagation();
    },
  };

  const renderItem = (item: ProposalMenuItem, inSubmenu: boolean) => {
    const Icon = item.icon;
    const hasSubmenu = !inSubmenu && (item.submenu?.length ?? 0) > 0;
    const expanded = hasSubmenu && parentId === item.id;
    return (
      <button
        key={item.id}
        ref={
          inSubmenu
            ? undefined
            : (node) => {
                if (node) rowRefs.current.set(item.id, node);
                else rowRefs.current.delete(item.id);
              }
        }
        type="button"
        role="menuitem"
        data-menu-id={item.id}
        aria-disabled={item.disabled ? 'true' : undefined}
        aria-haspopup={hasSubmenu ? 'menu' : undefined}
        aria-expanded={hasSubmenu ? expanded : undefined}
        onMouseEnter={
          inSubmenu
            ? undefined
            : () => {
                // Passing over a row opens its submenu, and passing over any
                // other row puts an open one away, as desktop menus do — after
                // a beat, in case the pointer is only crossing on its way in.
                // Counted from the first row crossed: a pointer moving slowly
                // down the menu would otherwise restart it at every row and
                // keep the submenu open the whole way.
                if (hasSubmenu && !item.disabled) {
                  cancelGrace();
                  if (!expanded) setOpen({ id: item.id, focus: false });
                } else if (parentId && graceTimer.current === null) {
                  graceTimer.current = window.setTimeout(() => {
                    graceTimer.current = null;
                    setOpen(null);
                  }, SUBMENU_GRACE_MS);
                }
              }
        }
        onFocus={
          inSubmenu
            ? undefined
            : () => {
                // Arrowed onto another row: the open submenu is not its. The
                // keyboard never crosses a row by accident, so no grace here.
                if (parentId && parentId !== item.id) {
                  cancelGrace();
                  setOpen(null);
                }
              }
        }
        onClick={() => {
          if (item.disabled) return;
          if (hasSubmenu) {
            // Opens rather than toggles: the pointer usually opened it on the
            // way in, and a press that then shut it would undo the hover. The
            // first choice takes the focus, so Enter can go straight on.
            setOpen({ id: item.id, focus: true });
            return;
          }
          onClose();
          item.onSelect();
        }}
        className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] font-semibold focus-visible:outline-none ${
          item.disabled
            ? 'cursor-default text-rt-ink-faint'
            : item.destructive
              ? 'text-red-600 hover:bg-red-50 focus-visible:bg-red-50'
              : `text-rt-ink hover:bg-rt-primary-tint focus-visible:bg-rt-primary-tint ${
                  expanded ? 'bg-rt-primary-tint' : ''
                }`
        }`}
      >
        <Icon aria-hidden="true" size={14} strokeWidth={2} className="shrink-0" />
        <span className="flex-1">{item.label}</span>
        {item.hint ? (
          <span className="text-[10.5px] font-medium text-rt-ink-faint">{item.hint}</span>
        ) : null}
        {hasSubmenu ? (
          <ChevronRight
            aria-hidden="true"
            size={14}
            strokeWidth={2}
            className="-mr-1 shrink-0 text-rt-ink-faint"
          />
        ) : null}
      </button>
    );
  };

  return createPortal(
    <>
      <div
        ref={panelRef}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onMenuKeyDown}
        {...contain}
        className={PANEL_CLASS}
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
            {group.map((item) => renderItem(item, false))}
          </Fragment>
        ))}
      </div>
      {/* Beside the menu rather than inside it, so the menu's own arrow keys
          walk only its own rows. */}
      {parent?.submenu ? (
        <div
          ref={subRef}
          role="menu"
          aria-label={parent.label}
          tabIndex={-1}
          onKeyDown={onSubmenuKeyDown}
          // Arrived: whatever row the pointer crossed on the way, it stays.
          onMouseEnter={cancelGrace}
          {...contain}
          className={PANEL_CLASS}
          style={{
            top: subPosition?.top ?? 0,
            left: subPosition?.left ?? 0,
            visibility: subPosition ? 'visible' : 'hidden',
          }}
        >
          {parent.submenu.map((item) => renderItem(item, true))}
        </div>
      ) : null}
    </>,
    document.body,
  );
}

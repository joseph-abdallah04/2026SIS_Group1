import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Copy, Download, FileCode2, ImageDown, Trash2 } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ProposalActionsMenu,
  SUBMENU_GRACE_MS,
  type ProposalMenuAnchor,
} from './ProposalActionsMenu';

const MENU_WIDTH = 180;
const MENU_HEIGHT = 120;

/** jsdom lays nothing out, so the menu is given a size to place. */
function sizeMenus() {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(MENU_WIDTH);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(MENU_HEIGHT);
}

function renderMenu(anchor: ProposalMenuAnchor, onClose = vi.fn()) {
  render(
    <ProposalActionsMenu
      anchor={anchor}
      label="Actions"
      onClose={onClose}
      sections={[
        [{ id: 'copy', label: 'Copy text', icon: Copy, onSelect: vi.fn() }],
        [],
        [{ id: 'delete', label: 'Delete', icon: Trash2, onSelect: vi.fn(), destructive: true }],
      ]}
    />,
  );
  return { menu: screen.getByRole('menu'), onClose };
}

afterEach(() => vi.restoreAllMocks());

describe('ProposalActionsMenu', () => {
  it('opens at the pointer when there is room', () => {
    sizeMenus();
    const { menu } = renderMenu({ kind: 'point', x: 100, y: 50 });

    expect(menu.style.left).toBe('100px');
    expect(menu.style.top).toBe('50px');
  });

  it('opens leftward and upward from a pointer near the bottom-right corner', () => {
    sizeMenus();
    const x = window.innerWidth - 20;
    const y = window.innerHeight - 20;
    const { menu } = renderMenu({ kind: 'point', x, y });

    expect(menu.style.left).toBe(`${x - MENU_WIDTH}px`);
    expect(menu.style.top).toBe(`${y - MENU_HEIGHT}px`);
  });

  it('opens a corner anchor with its top-left exactly at the corner', () => {
    sizeMenus();
    const { menu } = renderMenu({ kind: 'corner', left: 300, top: 40 });

    expect(menu.style.left).toBe('300px');
    expect(menu.style.top).toBe('40px');
  });

  it('slides a corner anchor back inside the window near the right edge', () => {
    sizeMenus();
    const { menu } = renderMenu({ kind: 'corner', left: window.innerWidth - 30, top: 40 });

    expect(menu.style.left).toBe(`${window.innerWidth - MENU_WIDTH - 8}px`);
  });

  it('slides a corner anchor back inside the window near the bottom and top', () => {
    sizeMenus();
    const { menu } = renderMenu({ kind: 'corner', left: 100, top: window.innerHeight - 10 });
    expect(menu.style.top).toBe(`${window.innerHeight - MENU_HEIGHT - 8}px`);
  });

  it('keeps a card scrolled above the window from pushing the menu off screen', () => {
    sizeMenus();
    const { menu } = renderMenu({ kind: 'corner', left: 100, top: -200 });
    expect(menu.style.top).toBe('8px');
  });

  it('drops empty groups, so no rule is drawn around nothing', () => {
    renderMenu({ kind: 'point', x: 0, y: 0 });

    expect(screen.getAllByRole('separator')).toHaveLength(1);
  });

  it('closes on Escape and gives focus back', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const onClose = vi.fn();
    const { unmount } = render(
      <ProposalActionsMenu
        anchor={{ kind: 'point', x: 0, y: 0 }}
        label="Actions"
        onClose={onClose}
        sections={[[{ id: 'copy', label: 'Copy text', icon: Copy, onSelect: vi.fn() }]]}
      />,
    );
    expect(document.activeElement?.textContent).toBe('Copy text');

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  // A second right-click, or the Menu key, opens the same menu somewhere new
  // without closing it first. It has to go to the new spot.
  it('moves to a new anchor while it is open', () => {
    sizeMenus();
    const sections = [[{ id: 'copy', label: 'Copy text', icon: Copy, onSelect: vi.fn() }]];
    const onClose = vi.fn();
    const { rerender } = render(
      <ProposalActionsMenu
        anchor={{ kind: 'point', x: 100, y: 50 }}
        label="Actions"
        onClose={onClose}
        sections={sections}
      />,
    );
    expect(screen.getByRole('menu').style.left).toBe('100px');

    rerender(
      <ProposalActionsMenu
        anchor={{ kind: 'point', x: 300, y: 200 }}
        label="Actions"
        onClose={onClose}
        sections={sections}
      />,
    );
    expect(screen.getByRole('menu').style.left).toBe('300px');
    expect(screen.getByRole('menu').style.top).toBe('200px');
  });

  // The Menu key on another card opens its menu with no press to close this
  // one, which would leave two menus open.
  it('closes when a context menu opens anywhere outside it', () => {
    const { onClose } = renderMenu({ kind: 'point', x: 0, y: 0 });

    fireEvent.contextMenu(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open for a right-click inside itself', () => {
    const { menu, onClose } = renderMenu({ kind: 'point', x: 0, y: 0 });

    fireEvent.contextMenu(menu);
    expect(onClose).not.toHaveBeenCalled();
  });
});

/** A menu whose Export row opens its formats a level down. */
function renderWithSubmenu() {
  const onClose = vi.fn();
  const asSvg = vi.fn();
  render(
    <ProposalActionsMenu
      anchor={{ kind: 'point', x: 100, y: 50 }}
      label="Actions"
      onClose={onClose}
      sections={[
        [
          { id: 'copy', label: 'Copy text', icon: Copy, onSelect: vi.fn() },
          {
            id: 'export',
            label: 'Export',
            icon: Download,
            onSelect: vi.fn(),
            submenu: [
              { id: 'png', label: 'As PNG', icon: ImageDown, onSelect: vi.fn() },
              { id: 'svg', label: 'As SVG', icon: FileCode2, onSelect: asSvg },
            ],
          },
        ],
      ]}
    />,
  );
  const exportRow = screen.getByRole('menuitem', { name: 'Export' });
  const formats = () => screen.queryByRole('menu', { name: 'Export' });
  return { onClose, asSvg, exportRow, formats };
}

describe('ProposalActionsMenu submenu', () => {
  it('marks the row as opening a menu of its own', () => {
    const { exportRow, formats } = renderWithSubmenu();
    expect(exportRow).toHaveAttribute('aria-haspopup', 'menu');
    expect(exportRow).toHaveAttribute('aria-expanded', 'false');
    expect(formats()).toBeNull();
  });

  it('opens on hover without taking the focus', async () => {
    const { exportRow, formats } = renderWithSubmenu();
    await userEvent.hover(exportRow);

    expect(formats()).not.toBeNull();
    expect(exportRow).toHaveAttribute('aria-expanded', 'true');
    expect(within(formats()!).getByRole('menuitem', { name: 'As PNG' })).not.toHaveFocus();
  });

  describe('crossing another row', () => {
    afterEach(() => vi.useRealTimers());

    // Synchronous pointer events: user-event's own waits and fake timers
    // would hold each other up.
    const enter = (element: Element) => fireEvent.mouseEnter(element);

    it('waits a beat before closing, so a diagonal move on the way in does not lose it', () => {
      vi.useFakeTimers();
      const { exportRow, formats } = renderWithSubmenu();
      enter(exportRow);
      enter(screen.getByRole('menuitem', { name: 'Copy text' }));

      expect(formats()).not.toBeNull();
      act(() => vi.advanceTimersByTime(SUBMENU_GRACE_MS));
      expect(formats()).toBeNull();
    });

    it('counts from the first row crossed, so drifting down the menu does not hold it open', () => {
      vi.useFakeTimers();
      render(
        <ProposalActionsMenu
          anchor={{ kind: 'point', x: 100, y: 50 }}
          label="Actions"
          onClose={vi.fn()}
          sections={[
            [
              {
                id: 'export',
                label: 'Export',
                icon: Download,
                onSelect: vi.fn(),
                submenu: [{ id: 'png', label: 'As PNG', icon: ImageDown, onSelect: vi.fn() }],
              },
              { id: 'copy', label: 'Copy text', icon: Copy, onSelect: vi.fn() },
              { id: 'delete', label: 'Delete', icon: Trash2, onSelect: vi.fn() },
            ],
          ]}
        />,
      );
      const formats = () => screen.queryByRole('menu', { name: 'Export' });
      enter(screen.getByRole('menuitem', { name: 'Export' }));
      enter(screen.getByRole('menuitem', { name: 'Copy text' }));
      act(() => vi.advanceTimersByTime(SUBMENU_GRACE_MS - 100));
      enter(screen.getByRole('menuitem', { name: 'Delete' }));

      expect(formats()).not.toBeNull();
      act(() => vi.advanceTimersByTime(100));
      expect(formats()).toBeNull();
    });

    it('stays open once the pointer reaches it', () => {
      vi.useFakeTimers();
      const { exportRow, formats } = renderWithSubmenu();
      enter(exportRow);
      enter(screen.getByRole('menuitem', { name: 'Copy text' }));
      enter(formats()!);

      act(() => vi.advanceTimersByTime(SUBMENU_GRACE_MS * 2));
      expect(formats()).not.toBeNull();
    });

    it('stays open when the pointer comes back to its row', () => {
      vi.useFakeTimers();
      const { exportRow, formats } = renderWithSubmenu();
      enter(exportRow);
      enter(screen.getByRole('menuitem', { name: 'Copy text' }));
      enter(exportRow);

      act(() => vi.advanceTimersByTime(SUBMENU_GRACE_MS * 2));
      expect(formats()).not.toBeNull();
    });

    it('closes at once when the keyboard moves to another row', () => {
      const { exportRow, formats } = renderWithSubmenu();
      // The menu opens with focus on its first row; arrow onto Export, open
      // its submenu, then arrow back up.
      act(() => exportRow.focus());
      enter(exportRow);
      act(() => screen.getByRole('menuitem', { name: 'Copy text' }).focus());

      expect(formats()).toBeNull();
    });
  });

  it('opens on the right arrow with the first format focused; the left arrow goes back', async () => {
    const { exportRow, formats, onClose } = renderWithSubmenu();
    exportRow.focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(within(formats()!).getByRole('menuitem', { name: 'As PNG' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(within(formats()!).getByRole('menuitem', { name: 'As SVG' })).toHaveFocus();

    await userEvent.keyboard('{ArrowLeft}');
    expect(formats()).toBeNull();
    expect(exportRow).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes only the submenu on Escape, then the menu on a second', async () => {
    const { exportRow, formats, onClose } = renderWithSubmenu();
    await userEvent.click(exportRow);
    expect(formats()).not.toBeNull();

    await userEvent.keyboard('{Escape}');
    expect(formats()).toBeNull();
    expect(exportRow).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does what the chosen format says and closes', async () => {
    const { exportRow, onClose, asSvg } = renderWithSubmenu();
    await userEvent.click(exportRow);
    await userEvent.click(screen.getByRole('menuitem', { name: 'As SVG' }));

    expect(asSvg).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('counts a press in the submenu as inside, and anywhere else as outside', async () => {
    const { exportRow, formats, onClose } = renderWithSubmenu();
    await userEvent.click(exportRow);

    fireEvent.pointerDown(formats()!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the arrow keys of the menu to its own rows', async () => {
    const { exportRow } = renderWithSubmenu();
    await userEvent.hover(exportRow);
    exportRow.focus();
    await userEvent.keyboard('{ArrowDown}');

    // Wrapped round to the menu's first row, not down into the formats.
    expect(screen.getByRole('menuitem', { name: 'Copy text' })).toHaveFocus();
  });
});

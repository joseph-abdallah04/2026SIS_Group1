import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Copy, Trash2 } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProposalActionsMenu, type ProposalMenuAnchor } from './ProposalActionsMenu';

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

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardItem } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

import { PositionedProposal } from './PositionedProposal';

function stickyItem(text: string): BoardItem {
  return {
    id: 'sticky-1',
    questionId: 'q1',
    authorId: 'viewer',
    authorName: 'Alice',
    type: 'sticky',
    artifactJson: { type: 'sticky', text, color: 'yellow' },
    x: 0,
    y: 0,
    createdAt: '2026-09-07T00:00:00.000Z',
    z: 0,
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
    reactions: [],
  };
}

/** The viewer owns this card, so Edit is offered in its menu. */
function renderOwnSticky({ boardOpen = true }: { boardOpen?: boolean } = {}) {
  const onOpenEditor = vi.fn();
  render(
    <PositionedProposal
      item={stickyItem('Ship the beta')}
      position={{ x: 0, y: 0 }}
      isNew={false}
      isOwn
      isAuthorLeader={false}
      boardOpen={boardOpen}
      onOpenEditor={boardOpen ? onOpenEditor : undefined}
      canMove={boardOpen}
      canDelete={boardOpen}
      canArrange={false}
      stackIndex={0}
      stackSize={1}
      onArrange={vi.fn()}
      onCopyText={vi.fn()}
      isDragging={false}
      dragHandlers={{
        onPointerDown: vi.fn(),
        onPointerMove: vi.fn(),
        onPointerUp: vi.fn(),
        onPointerCancel: vi.fn(),
      }}
      onDelete={vi.fn(async () => {})}
      viewerId="viewer"
      onReact={vi.fn(async () => {})}
      isShortlisted={false}
      canToggleShortlist={false}
      onToggleShortlist={vi.fn()}
    />,
  );
  return { onOpenEditor };
}

describe('editing a sticky', () => {
  // A sticky reopens in its popup, where its formatting can be changed. A plain
  // box on the card would have flattened a formatted note the moment it opened.
  it('opens the sticky editor rather than a box on the card', async () => {
    const { onOpenEditor } = renderOwnSticky();

    await userEvent.click(screen.getByRole('button', { name: 'Proposal actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(onOpenEditor).toHaveBeenCalledWith(expect.objectContaining({ id: 'sticky-1' }));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('offers no edit once the board is closed to changes', async () => {
    renderOwnSticky({ boardOpen: false });

    // Copying the words is still on offer; changing them is not.
    await userEvent.click(screen.getByRole('button', { name: 'Proposal actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Copy text' })).toBeTruthy();
  });
});

const ITEM: BoardItem = {
  id: 'p1',
  questionId: 'q1',
  authorId: 'u1',
  authorName: 'Joey',
  type: 'sticky',
  artifactJson: { type: 'sticky', text: 'A wavy line of thought', color: 'yellow' },
  x: 40,
  y: 40,
  createdAt: '2026-09-10T07:24:00.000Z',
  z: 0,
  editedAt: null,
  extendsProposalId: null,
  extendsFrom: null,
  reactions: [],
};

const dragHandlers = {
  onPointerDown: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerUp: vi.fn(),
  onPointerCancel: vi.fn(),
};

function renderCard({
  canToggleShortlist = true,
  onToggleShortlist = () => undefined,
}: {
  canToggleShortlist?: boolean;
  onToggleShortlist?: (id: string) => void;
} = {}) {
  return render(
    <div style={{ position: 'relative', width: 400, height: 400 }}>
      <PositionedProposal
        item={ITEM}
        position={{ x: 40, y: 40 }}
        isNew={false}
        isOwn={false}
        isAuthorLeader={false}
        boardOpen={false}
        canMove={false}
        canDelete={false}
        canArrange={false}
        stackIndex={0}
        stackSize={1}
        onArrange={() => undefined}
        onCopyText={() => undefined}
        isDragging={false}
        dragHandlers={dragHandlers}
        onDelete={async () => undefined}
        viewerId="leader-1"
        isShortlisted={false}
        canToggleShortlist={canToggleShortlist}
        onToggleShortlist={onToggleShortlist}
      />
    </div>,
  );
}

describe('PositionedProposal shortlist', () => {
  it('selects the proposal when the leader clicks the card, not only the tick', async () => {
    const onToggleShortlist = vi.fn();
    renderCard({ onToggleShortlist });

    await userEvent.click(screen.getByText('A wavy line of thought'));
    expect(onToggleShortlist).toHaveBeenCalledWith('p1');
    expect(onToggleShortlist).toHaveBeenCalledTimes(1);
  });

  it('does not double-toggle when the leader clicks the tick', async () => {
    const onToggleShortlist = vi.fn();
    renderCard({ onToggleShortlist });

    await userEvent.click(screen.getByRole('button', { name: 'Add to shortlist' }));
    expect(onToggleShortlist).toHaveBeenCalledWith('p1');
    expect(onToggleShortlist).toHaveBeenCalledTimes(1);
  });

  it('does not treat a click as a shortlist action when the leader is not selecting', async () => {
    const onToggleShortlist = vi.fn();
    renderCard({ canToggleShortlist: false, onToggleShortlist });

    await userEvent.click(screen.getByText('A wavy line of thought'));
    expect(onToggleShortlist).not.toHaveBeenCalled();
  });
});

const DIAGRAM: BoardItem = {
  ...ITEM,
  id: 'd1',
  type: 'diagram',
  artifactJson: { type: 'diagram', nodes: [], edges: [] },
};

/** A studio canvas with something on it, so there is a canvas to open. */
const DRAWN_ON: BoardItem = {
  ...DIAGRAM,
  id: 'd2',
  artifactJson: {
    type: 'diagram',
    nodes: [{ id: 'n1', label: 'Ledger', x: 24, y: 24, shape: 'box' }],
    edges: [],
  },
};

type MenuCardProps = Partial<Parameters<typeof PositionedProposal>[0]>;

/** A card on an open board, with every callback observable. */
function renderMenuCard(props: MenuCardProps = {}) {
  const callbacks = {
    onArrange: vi.fn(),
    onCopyText: vi.fn(),
    onDelete: vi.fn(async () => undefined),
    onOpenEditor: vi.fn(),
    onExtend: vi.fn(),
  };
  const view = render(
    <PositionedProposal
      item={ITEM}
      position={{ x: 40, y: 40 }}
      isNew={false}
      isOwn={false}
      isAuthorLeader={false}
      boardOpen
      canMove={false}
      canDelete={false}
      canArrange={false}
      stackIndex={1}
      stackSize={3}
      isDragging={false}
      dragHandlers={dragHandlers}
      viewerId="viewer"
      isShortlisted={false}
      canToggleShortlist={false}
      onToggleShortlist={() => undefined}
      {...callbacks}
      {...props}
    />,
  );
  return { ...callbacks, ...view };
}

const menuLabels = () => screen.getAllByRole('menuitem').map((item) => item.textContent);
const openFromButton = () =>
  userEvent.click(screen.getByRole('button', { name: 'Proposal actions' }));
const cardWrapper = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe('PositionedProposal actions menu', () => {
  it('gives the author of a sticky copy, edit, extend and delete', async () => {
    renderMenuCard({ isOwn: true, canMove: true, canDelete: true });
    await openFromButton();

    expect(menuLabels()).toEqual(['Copy text', 'Edit', 'Extend', 'Delete']);
    // Arranging is the leader's, so its group — and the rule before it — is gone.
    expect(screen.getAllByRole('separator')).toHaveLength(1);
  });

  it('gives the leader front/back and Remove on somebody else’s card, but not Edit', async () => {
    renderMenuCard({ canMove: true, canDelete: true, canArrange: true });
    await openFromButton();

    expect(menuLabels()).toEqual([
      'Copy text',
      'Extend',
      'Bring to front',
      'Send to back',
      'Remove',
    ]);
    expect(screen.getAllByRole('separator')).toHaveLength(2);
  });

  it('offers a participant only copy and extend on another person’s sticky', async () => {
    renderMenuCard();
    await openFromButton();

    expect(menuLabels()).toEqual(['Copy text', 'Extend']);
    expect(screen.queryByRole('separator')).toBeNull();
  });

  it('leaves copy out for anything that is not a sticky', async () => {
    renderMenuCard({ item: DIAGRAM });
    await openFromButton();

    expect(menuLabels()).toEqual(['Extend']);
  });

  // The corner of a card is a small target to find. The menu is where every
  // other thing you can do to a card already lives.
  it('opens the preview from the menu, and stops offering it while it is open', async () => {
    renderMenuCard({ item: DRAWN_ON });
    await openFromButton();
    expect(menuLabels()).toContain('Enlarge');

    await userEvent.click(screen.getByRole('menuitem', { name: 'Enlarge' }));

    expect(screen.getByRole('dialog', { name: /diagram by/ })).toBeInTheDocument();
    // The card's own way in is behind the preview it opened, so it is gone
    // rather than sitting there doing nothing.
    expect(screen.queryByRole('button', { name: /^Enlarge diagram/ })).toBeNull();

    // Opened from the keyboard, which presses nothing outside the preview and
    // so leaves it open: there is nothing left to offer.
    screen.getByRole('button', { name: 'Proposal actions' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(menuLabels()).not.toContain('Enlarge');
  });

  // A press anywhere outside puts the preview away, the menu's own button
  // included, so the menu that opens after it offers the preview again.
  it('offers the preview again once a press outside has put it away', async () => {
    renderMenuCard({ item: DRAWN_ON });
    await openFromButton();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Enlarge' }));
    expect(screen.getByRole('dialog', { name: /diagram by/ })).toBeInTheDocument();

    await openFromButton();

    expect(screen.queryByRole('dialog', { name: /diagram by/ })).toBeNull();
    expect(menuLabels()).toContain('Enlarge');
  });

  // Drawn on the page, the enlarged view still belongs to this card in React's
  // tree, so its presses travelled up to the card's own drag. The card was
  // picked up behind it, and took the pointer with it: the press that was
  // meant to zoom never finished.
  it('keeps a press inside the enlarged canvas away from the card behind it', async () => {
    renderMenuCard({ item: DRAWN_ON, canMove: true });
    await openFromButton();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Enlarge' }));
    dragHandlers.onPointerDown.mockClear();

    const frame = screen.getByRole('button', { name: /^Zoom/ });
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 300, clientY: 200, isPrimary: true });
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 300, clientY: 200, isPrimary: true });

    expect(dragHandlers.onPointerDown).not.toHaveBeenCalled();
    expect(frame).toHaveAccessibleName('Zoom out');
  });

  // An empty canvas draws the same empty plate however large it is shown.
  it('offers no preview of a canvas with nothing on it', async () => {
    renderMenuCard({ item: DIAGRAM });
    await openFromButton();

    expect(menuLabels()).not.toContain('Enlarge');
  });

  it('extends the card and closes the menu', async () => {
    const { onExtend } = renderMenuCard();
    await openFromButton();

    const extend = screen.getByRole('menuitem', { name: 'Extend' });
    expect(extend.getAttribute('aria-disabled')).toBeNull();
    await userEvent.click(extend);

    expect(onExtend).toHaveBeenCalledWith(ITEM);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  // The board decides: closed, or a card with nothing to copy from.
  it('leaves Extend out when the card cannot be extended', async () => {
    renderMenuCard({ onExtend: undefined });
    await openFromButton();

    expect(menuLabels()).toEqual(['Copy text']);
  });

  it('copies a sticky’s text and closes', async () => {
    const { onCopyText } = renderMenuCard();
    await openFromButton();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy text' }));

    expect(onCopyText).toHaveBeenCalledWith(ITEM);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('brings to front and sends to back', async () => {
    const { onArrange } = renderMenuCard({ canArrange: true });
    await openFromButton();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Bring to front' }));
    await openFromButton();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Send to back' }));

    expect(onArrange.mock.calls).toEqual([
      [ITEM, 'front'],
      [ITEM, 'back'],
    ]);
  });

  it('greys out bring to front on the card already on top', async () => {
    renderMenuCard({ canArrange: true, stackIndex: 2, stackSize: 3 });
    await openFromButton();

    expect(
      screen.getByRole('menuitem', { name: 'Bring to front' }).getAttribute('aria-disabled'),
    ).toBe('true');
    expect(
      screen.getByRole('menuitem', { name: 'Send to back' }).getAttribute('aria-disabled'),
    ).toBeNull();
  });

  it('asks before deleting', async () => {
    const { onDelete } = renderMenuCard({ isOwn: true, canMove: true, canDelete: true });
    await openFromButton();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('opens on right-click in place of the browser menu, and marks the card', () => {
    const { container } = renderMenuCard();
    const card = cardWrapper(container);

    const notCancelled = fireEvent.contextMenu(screen.getByText('A wavy line of thought'), {
      clientX: 120,
      clientY: 80,
    });

    expect(notCancelled).toBe(false);
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(card.getAttribute('data-menu-open')).toBe('true');
  });

  it('closes on Escape and on a press elsewhere', async () => {
    const { container } = renderMenuCard();
    await openFromButton();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();

    await openFromButton();
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(cardWrapper(container).getAttribute('data-menu-open')).toBeNull();
  });

  it('hides the ⋯ while its menu is open, and brings it back on close', async () => {
    renderMenuCard();
    const button = screen.getByRole('button', { name: 'Proposal actions' });
    await openFromButton();

    expect(button.className).toContain('opacity-0');
    expect(button.className).toContain('pointer-events-none');

    await userEvent.keyboard('{Escape}');
    expect(button.className).not.toContain('pointer-events-none');
  });

  it('opens the ⋯ menu from the button’s left edge, level with the card’s top', async () => {
    const { container } = renderMenuCard();
    const card = cardWrapper(container);
    const button = screen.getByRole('button', { name: 'Proposal actions' });
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ top: 120, left: 40 } as DOMRect);
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ top: 110, left: 250 } as DOMRect);

    await openFromButton();

    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('250px');
    expect(menu.style.top).toBe('120px');
  });

  it('outlines the card in blue while its menu is open', async () => {
    const { container } = renderMenuCard();
    await openFromButton();

    expect(cardWrapper(container).style.outlineColor).toBe('rgb(59, 130, 246)');
  });

  // Opening a sticky's link in a new tab, or copying its address, is what a
  // right-click on it is for.
  it('leaves the browser menu alone over a link in a sticky', () => {
    renderMenuCard({
      item: {
        ...ITEM,
        artifactJson: {
          type: 'sticky',
          text: 'See the spec',
          color: 'yellow',
          links: [{ from: 8, to: 12, href: 'https://example.com/spec' }],
        },
      },
    });

    const link = screen.getByRole('link', { name: 'spec' });
    expect(fireEvent.contextMenu(link, { clientX: 10, clientY: 10 })).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();

    // Anywhere else on the same card still opens the card's own menu.
    expect(fireEvent.contextMenu(screen.getByText('See the'), { clientX: 10, clientY: 10 })).toBe(
      false,
    );
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('leaves the browser menu alone when there is nothing to offer', () => {
    // A diagram on a closed board: no copy, no extend, nothing else allowed.
    renderMenuCard({ item: DIAGRAM, boardOpen: false, onExtend: undefined });

    expect(screen.queryByRole('button', { name: 'Proposal actions' })).toBeNull();
    const notCancelled = fireEvent.contextMenu(screen.getByRole('article'), {
      clientX: 10,
      clientY: 10,
    });
    expect(notCancelled).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves between items with the arrow keys, skipping disabled ones', async () => {
    // The leader's own card, already on top, so Bring to front is greyed out.
    renderMenuCard({
      isOwn: true,
      canMove: true,
      canDelete: true,
      canArrange: true,
      stackIndex: 2,
      stackSize: 3,
    });
    await openFromButton();

    expect(document.activeElement?.textContent).toBe('Copy text');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Edit');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Extend');
    await userEvent.keyboard('{ArrowDown}');
    // Bring to front is disabled, so the next stop is Send to back.
    expect(document.activeElement?.textContent).toBe('Send to back');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Delete');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Copy text');
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement?.textContent).toBe('Delete');
  });

  // Whatever the viewer may do can change under an open menu; one left with
  // nothing in it would be an empty box over the board.
  it('closes its menu when there is no longer anything in it', async () => {
    const view = renderMenuCard({ item: DIAGRAM });
    await openFromButton();
    expect(screen.getByRole('menu')).toBeTruthy();

    // The board closes: no Extend, and a diagram has no Copy.
    view.rerender(
      <PositionedProposal
        item={DIAGRAM}
        position={{ x: 40, y: 40 }}
        isNew={false}
        isOwn={false}
        isAuthorLeader={false}
        boardOpen={false}
        canMove={false}
        canDelete={false}
        canArrange={false}
        stackIndex={1}
        stackSize={3}
        isDragging={false}
        dragHandlers={dragHandlers}
        viewerId="viewer"
        isShortlisted={false}
        canToggleShortlist={false}
        onToggleShortlist={() => undefined}
        onArrange={view.onArrange}
        onCopyText={view.onCopyText}
        onDelete={view.onDelete}
      />,
    );

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('raises the card while its menu is open', async () => {
    const { container } = renderMenuCard({ stackIndex: 0, stackSize: 3 });
    const card = cardWrapper(container);
    expect(card.style.zIndex).toBe('1');

    await openFromButton();
    expect(Number(card.style.zIndex)).toBeGreaterThan(3);
  });
});

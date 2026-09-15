import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardItem } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

import { STICKY_TEXT_LIMIT } from '../tools/artifactLimits';
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
    reactions: [],
  };
}

/** The viewer owns this card, so Edit and the inline editor are offered. */
function renderOwnSticky(text = 'Ship the beta') {
  const onEditText = vi.fn(async () => {});
  render(
    <PositionedProposal
      item={stickyItem(text)}
      position={{ x: 0, y: 0 }}
      isNew={false}
      isOwn
      isAuthorLeader={false}
      boardOpen
      canMove
      canDelete
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
      onEditText={onEditText}
      onDelete={vi.fn(async () => {})}
      viewerId="viewer"
      onReact={vi.fn(async () => {})}
      isShortlisted={false}
      canToggleShortlist={false}
      onToggleShortlist={vi.fn()}
    />,
  );
  return { onEditText };
}

const openEditor = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Proposal actions' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
  return screen.getByRole('textbox', { name: 'Edit sticky note text' });
};

describe('editing a sticky in place', () => {
  it('saves the edited text', async () => {
    const { onEditText } = renderOwnSticky();

    const box = await openEditor();
    await userEvent.clear(box);
    await userEvent.type(box, 'Ship the beta on Friday');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onEditText).toHaveBeenCalledWith(expect.anything(), 'Ship the beta on Friday');
  });

  // Whitespace may be deliberate: a blank line between thoughts, an indent.
  it('saves the note exactly as typed, whitespace included', async () => {
    const { onEditText } = renderOwnSticky();

    const box = await openEditor();
    await userEvent.clear(box);
    await userEvent.type(box, '  Ship it{Shift>}{Enter}{Enter}{/Shift}    then celebrate  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onEditText).toHaveBeenCalledWith(expect.anything(), '  Ship it\n\n    then celebrate  ');
  });

  // The rule that applies when a sticky is written has to apply when it is
  // rewritten, or the cap is a formality that one click undoes.
  it('stops typing at the same limit the tool enforces', async () => {
    renderOwnSticky();

    const box = await openEditor();

    expect(box.getAttribute('maxlength')).toBe(String(STICKY_TEXT_LIMIT));
  });

  it('counts down against that limit while you type', async () => {
    renderOwnSticky('Hello');

    await openEditor();

    expect(screen.getByText(`5/${STICKY_TEXT_LIMIT}`)).toBeTruthy();
  });

  // The box stops at the limit counting every character, so the count has to
  // as well, or it reads short of the limit while refusing the next key.
  it('reads Full at the character limit rather than a count', async () => {
    renderOwnSticky('x'.repeat(STICKY_TEXT_LIMIT));

    await openEditor();

    expect(screen.getByText('Full')).toBeTruthy();
  });

  it('counts spaces at the end of the note', async () => {
    renderOwnSticky('Hello');

    const box = await openEditor();
    await userEvent.type(box, '{End}  ');

    expect(screen.getByText(`7/${STICKY_TEXT_LIMIT}`)).toBeTruthy();
  });

  // A note written before the cap existed, or through another client, opens
  // longer than the limit. Save is closed, and the reason is on screen rather
  // than waiting for a press that cannot land.
  it('refuses a note that is already over the limit, and says why', async () => {
    const { onEditText } = renderOwnSticky('x'.repeat(STICKY_TEXT_LIMIT + 20));

    await openEditor();

    expect(screen.getByRole('alert').textContent).toContain(String(STICKY_TEXT_LIMIT));
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    expect(onEditText).not.toHaveBeenCalled();
  });

  // The character cap counts characters; wide letters fill the paper first.
  // There is no size past the largest, so the editor stops taking text there.
  it('stops taking text once the note fills the largest sticky', async () => {
    // A stand-in layout in which a note longer than twelve characters overflows
    // the largest sticky, whatever the character count says.
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const note = this.querySelector('p')?.textContent ?? '';
        const width = parseFloat(this.style.width) || 0;
        return { width, height: note.length > 12 ? width + 50 : 100 } as DOMRect;
      });
    try {
      renderOwnSticky();
      const box = await openEditor();
      await userEvent.clear(box);
      await userEvent.type(box, 'Ship the beta on Friday');

      // Only visible text is refused; spaces at the end of a line take no room.
      expect((box as HTMLTextAreaElement).value.trim()).toBe('Ship the bet');
      // And the count says so, rather than showing room that is not there.
      expect(screen.getByText('Full')).toBeTruthy();

      // Taking text out makes room, and the count comes back.
      await userEvent.clear(box);
      expect(screen.getByText(`0/${STICKY_TEXT_LIMIT}`)).toBeTruthy();
    } finally {
      rect.mockRestore();
    }
  });

  it('refuses a new line past the last one without calling the note full', async () => {
    // A stand-in layout: twenty characters to a line and ten lines to the
    // largest sticky, so running out of lines and running out of room on the
    // last line are different moments.
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const note = this.querySelector('p')?.textContent ?? '';
        const width = parseFloat(this.style.width) || 0;
        const lines = note
          .split('\n')
          .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 20)), 0);
        return { width, height: lines > 10 ? width + 50 : 100 } as DOMRect;
      });
    try {
      renderOwnSticky('Idea');
      const box = await openEditor();
      await userEvent.type(box, `{End}${'{Shift>}{Enter}{/Shift}'.repeat(20)}`);

      expect((box as HTMLTextAreaElement).value.split('\n')).toHaveLength(10);
      expect(screen.queryByText('Full')).toBeNull();

      await userEvent.type(box, 'x'.repeat(30));
      expect(screen.getByText('Full')).toBeTruthy();
    } finally {
      rect.mockRestore();
    }
  });

  // A note can open already too tall for any sticky, though typing cannot
  // make one. Save stays closed, and the reason is on screen.
  it('will not save a note too tall for any sticky, and says why', async () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const text = this.querySelector('p')?.textContent ?? '';
        const width = parseFloat(this.style.width) || 0;
        return { width, height: text.length > 15 ? width + 50 : 100 } as DOMRect;
      });
    try {
      const { onEditText } = renderOwnSticky('This note is far too tall');
      const box = await openEditor();
      // Shortened, but not enough: deleting is always allowed.
      await userEvent.type(box, '{End}{Backspace}');

      expect(screen.getByRole('alert').textContent).toContain('too long to fit on a sticky');
      expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
      expect(onEditText).not.toHaveBeenCalled();
    } finally {
      rect.mockRestore();
    }
  });

  it('will not save an empty note', async () => {
    const { onEditText } = renderOwnSticky();

    const box = await openEditor();
    await userEvent.clear(box);

    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    expect(onEditText).not.toHaveBeenCalled();
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
  reactions: [],
};

const dragHandlers = {
  onPointerDown: () => undefined,
  onPointerMove: () => undefined,
  onPointerUp: () => undefined,
  onPointerCancel: () => undefined,
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
        onEditText={async () => undefined}
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

type MenuCardProps = Partial<Parameters<typeof PositionedProposal>[0]>;

/** A card on an open board, with every callback observable. */
function renderMenuCard(props: MenuCardProps = {}) {
  const callbacks = {
    onArrange: vi.fn(),
    onCopyText: vi.fn(),
    onDelete: vi.fn(async () => undefined),
    onOpenEditor: vi.fn(),
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
      onEditText={async () => undefined}
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

    expect(menuLabels()).toEqual(['Copy text', 'Edit', 'ExtendSoon', 'Delete']);
    // Arranging is the leader's, so its group — and the rule before it — is gone.
    expect(screen.getAllByRole('separator')).toHaveLength(1);
  });

  it('gives the leader front/back and Remove on somebody else’s card, but not Edit', async () => {
    renderMenuCard({ canMove: true, canDelete: true, canArrange: true });
    await openFromButton();

    expect(menuLabels()).toEqual([
      'Copy text',
      'ExtendSoon',
      'Bring to front',
      'Send to back',
      'Remove',
    ]);
    expect(screen.getAllByRole('separator')).toHaveLength(2);
  });

  it('offers a participant only copy and extend on another person’s sticky', async () => {
    renderMenuCard();
    await openFromButton();

    expect(menuLabels()).toEqual(['Copy text', 'ExtendSoon']);
    expect(screen.queryByRole('separator')).toBeNull();
  });

  it('leaves copy out for anything that is not a sticky', async () => {
    renderMenuCard({ item: DIAGRAM });
    await openFromButton();

    expect(menuLabels()).toEqual(['ExtendSoon']);
  });

  it('shows Extend but does nothing with it yet', async () => {
    renderMenuCard();
    await openFromButton();

    const extend = screen.getByRole('menuitem', { name: /Extend/ });
    expect(extend.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(extend);
    // Still open: a disabled item is not a choice.
    expect(screen.getByRole('menu')).toBeTruthy();
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

  it('leaves the browser menu alone when there is nothing to offer', () => {
    // A diagram on a closed board: no copy, no extend, nothing else allowed.
    renderMenuCard({ item: DIAGRAM, boardOpen: false });

    expect(screen.queryByRole('button', { name: 'Proposal actions' })).toBeNull();
    const notCancelled = fireEvent.contextMenu(screen.getByRole('article'), {
      clientX: 10,
      clientY: 10,
    });
    expect(notCancelled).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keeps the browser menu inside the note editor', async () => {
    renderOwnSticky();
    const box = await openEditor();

    const notCancelled = fireEvent.contextMenu(box, { clientX: 10, clientY: 10 });
    expect(notCancelled).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves between items with the arrow keys, skipping disabled ones', async () => {
    renderMenuCard({ isOwn: true, canMove: true, canDelete: true });
    await openFromButton();

    expect(document.activeElement?.textContent).toBe('Copy text');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Edit');
    await userEvent.keyboard('{ArrowDown}');
    // Extend is disabled, so the next stop is Delete.
    expect(document.activeElement?.textContent).toBe('Delete');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Copy text');
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement?.textContent).toBe('Delete');
  });

  it('raises the card while its menu is open', async () => {
    const { container } = renderMenuCard({ stackIndex: 0, stackSize: 3 });
    const card = cardWrapper(container);
    expect(card.style.zIndex).toBe('1');

    await openFromButton();
    expect(Number(card.style.zIndex)).toBeGreaterThan(3);
  });
});

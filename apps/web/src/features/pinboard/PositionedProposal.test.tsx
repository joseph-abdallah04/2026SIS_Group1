import { render, screen } from '@testing-library/react';
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
    editedAt: null,
    extendsProposalId: null,
    reactions: [],
  };
}

/** The viewer owns this card, so the pencil and the inline editor are offered. */
function renderOwnSticky(text = 'Ship the beta') {
  const onEditText = vi.fn(async () => {});
  render(
    <PositionedProposal
      item={stickyItem(text)}
      position={{ x: 0, y: 0 }}
      isNew={false}
      isOwn
      isAuthorLeader={false}
      canMove
      canDelete
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
  await userEvent.click(screen.getByRole('button', { name: 'Edit proposal' }));
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

      // Trailing spaces still go in: they take no room, and saving trims them.
      expect((box as HTMLTextAreaElement).value.trim()).toBe('Ship the bet');
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
        canMove={false}
        canDelete={false}
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

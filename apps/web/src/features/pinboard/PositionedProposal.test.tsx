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

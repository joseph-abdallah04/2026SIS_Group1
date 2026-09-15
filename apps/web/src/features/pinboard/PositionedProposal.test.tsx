import { render, screen } from '@testing-library/react';
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
    editedAt: null,
    extendsProposalId: null,
    reactions: [],
  };
}

/** The viewer owns this card, so the pencil is offered. */
function renderOwnSticky({ boardOpen = true }: { boardOpen?: boolean } = {}) {
  const onOpenEditor = vi.fn();
  render(
    <PositionedProposal
      item={stickyItem('Ship the beta')}
      position={{ x: 0, y: 0 }}
      isNew={false}
      isOwn
      isAuthorLeader={false}
      onOpenEditor={boardOpen ? onOpenEditor : undefined}
      canMove={boardOpen}
      canDelete={boardOpen}
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

    await userEvent.click(screen.getByRole('button', { name: 'Edit proposal' }));

    expect(onOpenEditor).toHaveBeenCalledWith(expect.objectContaining({ id: 'sticky-1' }));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('offers no edit once the board is closed to changes', () => {
    renderOwnSticky({ boardOpen: false });

    expect(screen.queryByRole('button', { name: 'Edit proposal' })).toBeNull();
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

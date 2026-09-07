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

  it('will not save an empty note', async () => {
    const { onEditText } = renderOwnSticky();

    const box = await openEditor();
    await userEvent.clear(box);

    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    expect(onEditText).not.toHaveBeenCalled();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardItem } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

import { ProposalCard } from './ProposalCard';

function item(artifactJson: BoardItem['artifactJson'], type: BoardItem['type']): BoardItem {
  return {
    id: 'proposal-1',
    questionId: 'question-1',
    authorId: 'user-1',
    authorName: 'Alice',
    type,
    artifactJson,
    x: 0,
    y: 0,
    createdAt: '2026-09-17T09:24:00.000Z',
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
    z: 0,
    reactions: [],
  };
}

const diagram = item(
  {
    type: 'diagram',
    nodes: [{ id: 'n1', label: 'Ledger', x: 24, y: 24, shape: 'box' }],
    edges: [],
  },
  'diagram',
);

const drawing = item(
  { type: 'drawing', svg: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" /></svg>' },
  'drawing',
);

const sticky = item({ type: 'sticky', text: 'Ship the API', color: 'yellow' }, 'sticky');

const previewButton = () => screen.getByRole('button', { name: 'Preview diagram by Alice' });

describe('proposal preview', () => {
  // The card shows a whole canvas at the width of a card. This opens the same
  // canvas at a size its labels can be read at.
  it('opens the canvas over the board, with the card and its byline intact', async () => {
    const user = userEvent.setup();
    const { container } = render(<ProposalCard item={diagram} />);
    const onCard = container.querySelectorAll('svg').length;

    await user.click(previewButton());

    const preview = screen.getByRole('dialog', { name: 'diagram by Alice' });
    expect(preview).toHaveTextContent('Alice');
    // Whatever clock the viewer keeps, the byline gives the time it was posted.
    expect(preview.textContent).toMatch(/\d{2}:\d{2}/);
    // Drawn again in the preview's frame rather than moved out of the card.
    expect(preview.querySelectorAll('svg').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('svg')).toHaveLength(onCard);
  });

  it('shows a drawing too', async () => {
    const user = userEvent.setup();
    render(<ProposalCard item={drawing} />);

    await user.click(screen.getByRole('button', { name: 'Preview drawing by Alice' }));

    const preview = screen.getByRole('dialog', { name: 'drawing by Alice' });
    expect(preview.querySelector('img')).toHaveAttribute('alt', 'Drawing by Alice');
  });

  it.each([
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    [
      'the close button',
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByRole('button', { name: 'Close preview' })),
    ],
  ])('closes on %s, handing focus back to the card', async (_, close) => {
    const user = userEvent.setup();
    render(<ProposalCard item={diagram} />);

    await user.click(previewButton());
    await close(user);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(previewButton()).toHaveFocus();
  });

  it('closes on a press beside the artwork', async () => {
    const user = userEvent.setup();
    render(<ProposalCard item={diagram} />);

    await user.click(previewButton());
    const scrim = screen.getByRole('dialog').parentElement!;
    fireEvent.pointerDown(scrim);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // A card is dragged from anywhere on it, and pressed to shortlist it.
  it('keeps a press on the button to the button', () => {
    const onPointerDown = vi.fn();
    const onClick = vi.fn();
    render(
      <div onPointerDown={onPointerDown} onClick={onClick}>
        <ProposalCard item={diagram} />
      </div>,
    );

    fireEvent.pointerDown(previewButton());
    fireEvent.click(previewButton());

    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  // The board behind it is covered, so nothing back there can be tabbed to.
  it('keeps the keyboard inside the preview while it is open', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ProposalCard item={diagram} />
        <button type="button">Behind the preview</button>
      </>,
    );

    await user.click(previewButton());
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close preview' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Close preview' })).toHaveFocus();
  });

  it('leaves a sticky alone, since its card already shows every word', () => {
    render(<ProposalCard item={sticky} />);

    expect(screen.queryByRole('button', { name: /^Preview/ })).toBeNull();
  });

  // On a ballot the card is itself the vote button, and a button inside a
  // button is neither one thing nor the other.
  it('offers nothing to press where the card is itself a press', () => {
    render(<ProposalCard item={diagram} interactive={false} />);

    expect(screen.queryByRole('button', { name: /^Preview/ })).toBeNull();
  });

  // Proposed before strokes were stored: there is nothing to open.
  it('leaves a drawing with nothing drawn in it alone', () => {
    render(<ProposalCard item={item({ type: 'drawing', svg: '' }, 'drawing')} />);

    expect(screen.queryByRole('button', { name: /^Preview/ })).toBeNull();
  });
});

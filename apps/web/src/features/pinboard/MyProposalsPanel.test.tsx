import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthoredProposalGroup, BoardItem } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

import { MyProposalsPanel, timeAgo } from './MyProposalsPanel';

function sticky(
  id: string,
  questionId: string,
  text: string,
  createdAt = '2026-09-07T00:00:00.000Z',
): BoardItem {
  return {
    id,
    questionId,
    authorId: 'viewer',
    authorName: 'Alice',
    type: 'sticky',
    artifactJson: { type: 'sticky', text, color: 'yellow' },
    x: 0,
    y: 0,
    createdAt,
    z: 0,
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
    reactions: [],
  };
}

function group(
  questionId: string,
  questionText: string,
  items: BoardItem[],
  isCurrent = false,
  questionPosition = 0,
  votingEnabled = true,
): AuthoredProposalGroup {
  return {
    questionId,
    questionText,
    questionPosition,
    votingEnabled,
    questionStatus: isCurrent ? 'discussion' : 'answered',
    isCurrent,
    items,
  };
}

const PAST = group('q1', 'What slowed us down?', [sticky('p1', 'q1', 'Flaky deploys')]);
const CURRENT = group('q2', 'What should we fix first?', [sticky('p2', 'q2', 'The deploy')], true);

function renderPanel({
  groups = [CURRENT, PAST] as AuthoredProposalGroup[],
  currentQuestionId = 'q2' as string | null,
  canPropose = true,
  error = null as string | null,
} = {}) {
  const onReuse = vi.fn();
  render(
    <MyProposalsPanel
      groups={groups}
      currentQuestionId={currentQuestionId}
      canPropose={canPropose}
      onReuse={onReuse}
      error={error}
    />,
  );
  return { onReuse };
}

const reuseButtons = () => screen.queryAllByRole('button', { name: /^Reuse / });

describe('my proposals panel', () => {
  it('lists what you proposed under the question it answered', () => {
    renderPanel();

    expect(screen.getByText('What slowed us down?')).toBeTruthy();
    expect(screen.getByText('Flaky deploys')).toBeTruthy();
  });

  // The point of the feature: send an earlier one to the question now up.
  it('reuses a proposal from an earlier question', async () => {
    const { onReuse } = renderPanel();

    await userEvent.click(
      screen.getByRole('button', { name: 'Reuse sticky on the current question' }),
    );

    expect(onReuse).toHaveBeenCalledTimes(1);
    expect(onReuse.mock.calls[0]?.[0]).toMatchObject({ id: 'p1' });
  });

  // Already on the board in front of you, so there is nothing to bring across.
  it('leaves out what is already on the current question', () => {
    renderPanel();

    expect(screen.queryByText('The deploy')).toBeNull();
    expect(screen.queryByText('What should we fix first?')).toBeNull();
    expect(reuseButtons()).toHaveLength(1);
  });

  it('offers nothing to reuse while the board is not taking proposals', () => {
    renderPanel({ canPropose: false });

    expect(screen.getByText('Flaky deploys')).toBeTruthy();
    expect(reuseButtons()).toHaveLength(0);
  });

  // Between questions there is no board to reuse onto.
  it('offers nothing to reuse when no question is open', () => {
    renderPanel({ groups: [PAST], currentQuestionId: null });

    expect(reuseButtons()).toHaveLength(0);
  });

  it('says what to expect when you have proposed nothing yet', () => {
    renderPanel({ groups: [] });

    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
  });

  // The board is unaffected by this list failing, so it reports quietly.
  it('reports a failed load without pretending the list is empty', () => {
    renderPanel({ error: 'Could not load your proposals' });

    expect(screen.getByRole('alert').textContent).toContain('Could not load');
    expect(screen.getByText('Flaky deploys')).toBeTruthy();
  });
});

// A long session leaves a lot behind; these keep it findable.
describe('my proposals panel with a lot to choose from', () => {
  const Q1 = group('q1', 'What slowed us down?', [sticky('a', 'q1', 'Flaky deploys')], false, 0);
  const Q2 = group(
    'q2',
    'Who are our users?',
    [
      sticky('b', 'q2', 'Agencies', '2026-09-07T10:00:00.000Z'),
      sticky('c', 'q2', 'Product teams', '2026-09-07T11:00:00.000Z'),
    ],
    false,
    1,
  );
  const NOW = group('q3', 'What do we build first?', [], true, 2);

  it('narrows the list to one question', async () => {
    renderPanel({ groups: [Q1, Q2, NOW], currentQuestionId: 'q3' });

    await userEvent.click(screen.getByRole('button', { name: 'Q2' }));

    expect(screen.queryByText('Flaky deploys')).toBeNull();
    expect(screen.getByText('Agencies')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Flaky deploys')).toBeTruthy();
  });

  it('shows the newest of a question’s ideas first', () => {
    renderPanel({ groups: [Q1, Q2, NOW], currentQuestionId: 'q3' });

    const texts = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(texts.findIndex((t) => t.includes('Product teams'))).toBeLessThan(
      texts.findIndex((t) => t.includes('Agencies')),
    );
  });

  // A picture or a drawing has no words to search for, so the list narrows by
  // kind instead. Drawings and diagrams are both made in the Studio.
  it('narrows the list to one kind of idea, and back', async () => {
    const mixed = group('q1', 'What slowed us down?', [
      sticky('s', 'q1', 'Flaky deploys'),
      {
        ...sticky('d', 'q1', ''),
        type: 'diagram',
        artifactJson: { type: 'diagram', nodes: [], edges: [] },
      } as BoardItem,
      {
        ...sticky('w', 'q1', ''),
        type: 'drawing',
        artifactJson: { type: 'drawing', svg: '<svg/>' },
      } as BoardItem,
    ]);
    renderPanel({ groups: [mixed, NOW], currentQuestionId: 'q3' });

    expect(screen.queryByRole('button', { name: 'Images' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Studio' }));

    expect(screen.queryByText('Flaky deploys')).toBeNull();
    expect(screen.getByText('Diagram')).toBeTruthy();
    expect(screen.getByText('Drawing')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Studio' }));
    expect(screen.getByText('Flaky deploys')).toBeTruthy();
  });

  it('keeps the filters away while there is nothing to narrow', () => {
    renderPanel({ groups: [Q1, NOW], currentQuestionId: 'q3' });

    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stickies' })).toBeNull();
  });

  it('heads each question with its number and status', () => {
    renderPanel({ groups: [Q1, NOW], currentQuestionId: 'q3' });

    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('Q1 · Answered');
  });

  // A brainstorm-only question has no answer: it was discussed.
  it('calls a finished brainstorm question discussed, not answered', () => {
    const brainstorm = group(
      'q1',
      'What could we try?',
      [sticky('b', 'q1', 'Pairing')],
      false,
      0,
      false,
    );
    renderPanel({ groups: [brainstorm, NOW], currentQuestionId: 'q3' });

    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('Q1 · Discussed');
  });

  it('closes from the button in its corner', async () => {
    const onClose = vi.fn();
    render(
      <MyProposalsPanel
        groups={[Q1, NOW]}
        currentQuestionId="q3"
        canPropose
        onReuse={vi.fn()}
        error={null}
        onClose={onClose}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// A long note is recognised by how it starts, formatting and all, and fades
// out where the card runs out of room rather than ending in an ellipsis.
describe('a sticky in the reuse popup', () => {
  const NOW = group('q3', 'What do we build first?', [], true, 2);

  function renderNote(note: Partial<BoardItem['artifactJson']>) {
    const item = sticky('n', 'q1', 'unused');
    item.artifactJson = { ...item.artifactJson, ...note } as BoardItem['artifactJson'];
    renderPanel({
      groups: [group('q1', 'What slowed us down?', [item]), NOW],
      currentQuestionId: 'q3',
    });
    return screen.getByRole('button', { name: 'Reuse sticky on the current question' });
  }

  it('shows the note with its formatting', () => {
    const card = renderNote({
      text: ['Ship it', 'then measure'].join(String.fromCharCode(10)),
      marks: [{ from: 0, to: 4, style: 'bold' }],
    } as Partial<BoardItem['artifactJson']>);

    const bold = within(card).getByText('Ship');
    expect(bold.tagName).toBe('SPAN');
    expect(bold.getAttribute('style')).toContain('font-weight');
    expect(within(card).getByText('then measure')).toBeTruthy();
  });

  it('fades a note that runs past the card, and only then', () => {
    const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(200);
    const client = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(72);
    const long = renderNote({ text: 'A long note' } as Partial<BoardItem['artifactJson']>);
    expect(long.querySelector('[data-overflows="true"]')).not.toBeNull();
    height.mockRestore();
    client.mockRestore();
  });

  // Read in full without leaving the popup, and without reusing it by mistake.
  it('opens a long note across its row, and closes it again', async () => {
    const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(200);
    const client = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(72);
    try {
      const card = renderNote({ text: 'A long note' } as Partial<BoardItem['artifactJson']>);
      const showAll = screen.getByRole('button', { name: 'Show all' });
      expect(showAll).toHaveAttribute('aria-expanded', 'false');

      await userEvent.click(showAll);

      const showLess = screen.getByRole('button', { name: 'Show less' });
      expect(showLess).toHaveAttribute('aria-expanded', 'true');
      expect(card.closest('li')).toHaveClass('col-span-full');
      expect(card.querySelector('[data-overflows]')).toBeNull();

      await userEvent.click(showLess);
      expect(screen.getByRole('button', { name: 'Show all' })).toBeTruthy();
      expect(card.closest('li')).not.toHaveClass('col-span-full');
    } finally {
      height.mockRestore();
      client.mockRestore();
    }
  });

  // Opened, it is brought into view from its top, so the whole note can be
  // read without scrolling for it.
  it('scrolls an opened note into view from its top', async () => {
    const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(200);
    const client = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(72);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderNote({ text: 'A long note' } as Partial<BoardItem['artifactJson']>);
      expect(scrollIntoView).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Show all' }));

      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
    } finally {
      height.mockRestore();
      client.mockRestore();
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('never reuses a note from its Show all', async () => {
    const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(200);
    const client = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(72);
    try {
      const item = sticky('n', 'q1', 'A long note');
      const onReuse = vi.fn();
      render(
        <MyProposalsPanel
          groups={[group('q1', 'What slowed us down?', [item]), group('q3', 'Now?', [], true, 2)]}
          currentQuestionId="q3"
          canPropose
          onReuse={onReuse}
          error={null}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
      expect(onReuse).not.toHaveBeenCalled();
    } finally {
      height.mockRestore();
      client.mockRestore();
    }
  });

  it('offers nothing to open on a note that fits', () => {
    renderNote({ text: 'Short' } as Partial<BoardItem['artifactJson']>);
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  });

  it('leaves a note that fits unfaded', () => {
    const card = renderNote({ text: 'Short' } as Partial<BoardItem['artifactJson']>);
    expect(card.querySelector('[data-overflows]')).toBeNull();
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-09-07T12:00:00.000Z').getTime();
  it.each([
    ['2026-09-07T11:59:40.000Z', 'just now'],
    ['2026-09-07T11:56:00.000Z', '4 min ago'],
    ['2026-09-07T09:00:00.000Z', '3 h ago'],
    ['2026-09-06T11:00:00.000Z', '1 day ago'],
  ])('says %s as %s', (iso, said) => {
    expect(timeAgo(iso, now)).toBe(said);
  });
});

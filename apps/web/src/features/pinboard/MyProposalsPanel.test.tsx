import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthoredProposalGroup, BoardItem } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

import { MyProposalsPanel } from './MyProposalsPanel';

function sticky(id: string, questionId: string, text: string): BoardItem {
  return {
    id,
    questionId,
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

function group(
  questionId: string,
  questionText: string,
  items: BoardItem[],
  isCurrent = false,
): AuthoredProposalGroup {
  return {
    questionId,
    questionText,
    questionPosition: 0,
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

  // Already on the board, so there is nothing to bring across. They are still
  // listed, because leaving them out would look like the list lost them.
  it('lists the current question without offering to reuse it', () => {
    renderPanel();

    expect(screen.getByText('The deploy')).toBeTruthy();
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

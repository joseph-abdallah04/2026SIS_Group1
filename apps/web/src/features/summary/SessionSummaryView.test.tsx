import type { BoardItem, SessionRecap } from '@roundtable/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SessionSummaryView } from './SessionSummaryView';

function sticky(id: string, text: string): BoardItem {
  return {
    id,
    questionId: 'q1',
    authorId: 'u2',
    authorName: 'Ada',
    type: 'sticky',
    artifactJson: { type: 'sticky', text, color: 'yellow' },
    x: 0,
    y: 0,
    createdAt: '2026-09-01T01:10:00.000Z',
    editedAt: null,
    extendsProposalId: null,
    reactions: [],
  };
}

const RECAP: SessionRecap = {
  sessionId: 's1',
  title: 'Roadmap',
  createdAt: '2026-09-01T00:00:00.000Z',
  startedAt: '2026-09-01T01:00:00.000Z',
  endedAt: '2026-09-01T02:00:00.000Z',
  leaderId: 'leader-1',
  participants: [
    { userId: 'leader-1', displayName: 'Jordan', isLeader: true },
    { userId: 'u2', displayName: 'Ada', isLeader: false },
  ],
  questions: [
    {
      id: 'q1',
      position: 0,
      text: 'What ships first?',
      status: 'answered',
      proposals: [sticky('p1', 'The API'), sticky('p2', 'The UI')],
      winnerProposalId: 'p1',
      tiedProposalIds: [],
      tallies: [
        { proposalId: 'p1', votes: 2, percent: 67 },
        { proposalId: 'p2', votes: 1, percent: 33 },
      ],
      votedCount: 3,
    },
    {
      id: 'q2',
      position: 1,
      text: 'What can wait?',
      status: 'skipped',
      proposals: [],
      winnerProposalId: null,
      tiedProposalIds: [],
      tallies: [],
      votedCount: 0,
    },
  ],
};

describe('SessionSummaryView', () => {
  it('shows who took part, the shortlist, and the winner', () => {
    render(<SessionSummaryView summary={RECAP} viewerId="u2" />);

    expect(screen.getByRole('heading', { name: 'Roadmap' })).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Jordan')).toBeInTheDocument();
    expect(screen.getByText('Leader')).toBeInTheDocument();
    expect(screen.getByText('What ships first?')).toBeInTheDocument();
    expect(screen.getByText('The API')).toBeInTheDocument();
    expect(screen.getByText('The UI')).toBeInTheDocument();
    expect(screen.getByText('Winner')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('Nothing was shortlisted for this question.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download Session Summary' })).not.toBeInTheDocument();
  });

  it('labels a tie on every shortlisted proposal that shares the top score', () => {
    render(
      <SessionSummaryView
        summary={{
          ...RECAP,
          questions: [
            {
              ...RECAP.questions[0]!,
              winnerProposalId: null,
              tiedProposalIds: ['p1', 'p2'],
              tallies: [
                { proposalId: 'p1', votes: 1, percent: 50 },
                { proposalId: 'p2', votes: 1, percent: 50 },
              ],
              votedCount: 2,
            },
          ],
        }}
        viewerId="u2"
      />,
    );

    expect(screen.getAllByText('Tied')).toHaveLength(2);
    expect(screen.queryByText('Winner')).not.toBeInTheDocument();
  });
});

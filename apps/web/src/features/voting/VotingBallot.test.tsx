import type { BoardItem } from '@roundtable/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VotingBallot } from './VotingBallot';

function sticky(id: string, text: string): BoardItem {
  return {
    id,
    questionId: 'q1',
    authorId: 'u1',
    authorName: 'Alice',
    type: 'sticky',
    artifactJson: { type: 'sticky', text, color: 'yellow' },
    x: 0,
    y: 0,
    createdAt: '2026-09-05T00:00:00.000Z',
    extendsProposalId: null,
    reactions: [],
  };
}

const ITEMS = [sticky('p1', 'Ship the API'), sticky('p2', 'Ship the UI')];

describe('VotingBallot', () => {
  it('lets a participant pick one proposal and shows live shares', async () => {
    const onVote = vi.fn();
    render(
      <VotingBallot
        questionText="What ships first?"
        items={ITEMS}
        tallies={[
          { proposalId: 'p1', votes: 1, percent: 50 },
          { proposalId: 'p2', votes: 1, percent: 50 },
        ]}
        myVote={null}
        votedCount={2}
        voterCount={4}
        isLeader={false}
        viewerId="u2"
        leaderId="u1"
        busy={false}
        error={null}
        onVote={onVote}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText('2 of 4 voted')).toBeInTheDocument();
    expect(screen.getAllByText(/50%/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'End voting' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Ship the API/i }));
    expect(onVote).toHaveBeenCalledWith('p1');
  });

  it('lets the leader end the vote', async () => {
    const onClose = vi.fn();
    render(
      <VotingBallot
        questionText="What ships first?"
        items={ITEMS}
        tallies={[
          { proposalId: 'p1', votes: 0, percent: 0 },
          { proposalId: 'p2', votes: 0, percent: 0 },
        ]}
        myVote="p2"
        votedCount={1}
        voterCount={2}
        isLeader
        viewerId="u1"
        leaderId="u1"
        busy={false}
        error={null}
        onVote={() => undefined}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('Your vote is in')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'End voting' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

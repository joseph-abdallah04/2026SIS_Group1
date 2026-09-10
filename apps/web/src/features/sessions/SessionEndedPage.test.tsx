import type { SessionRecap } from '@roundtable/shared';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { SessionDetail } from './useSessionDetail';

const RECAP: SessionRecap = {
  sessionId: 's1',
  title: 'Roadmap',
  createdAt: '2026-09-01T00:00:00.000Z',
  startedAt: '2026-09-01T01:00:00.000Z',
  endedAt: '2026-09-01T02:00:00.000Z',
  leaderId: 'leader-1',
  participants: [{ userId: 'leader-1', displayName: 'Leader', isLeader: true }],
  questions: [
    {
      id: 'q1',
      position: 0,
      text: 'What ships first?',
      status: 'answered',
      proposals: [],
      winnerProposalId: null,
      tallies: [],
      votedCount: 0,
    },
  ],
};

vi.mock('../summary/useSessionSummary', () => ({
  useSessionSummary: () => ({ summary: RECAP, loading: false, error: null }),
}));
vi.mock('../../lib/currentUser', () => ({
  useCurrentUserId: () => 'leader-1',
}));

const { SessionEndedPage } = await import('./SessionEndedPage');

const SESSION: SessionDetail = {
  id: 's1',
  code: null,
  title: 'Roadmap',
  leaderId: 'leader-1',
  status: 'ended',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  startedAt: new Date('2026-09-01T01:00:00.000Z'),
  endedAt: new Date('2026-09-01T02:00:00.000Z'),
  questions: [
    {
      id: 'q1',
      sessionId: 's1',
      text: 'What ships first?',
      position: 0,
      status: 'answered',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  ],
};

describe('SessionEndedPage', () => {
  it('renders the recap instead of the placeholder', () => {
    render(
      <MemoryRouter>
        <SessionEndedPage session={SESSION} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Roadmap' })).toBeInTheDocument();
    expect(screen.getByText('What ships first?')).toBeInTheDocument();
    expect(
      screen.queryByText(/auto-generated summary of what was decided/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toBeInTheDocument();
  });
});

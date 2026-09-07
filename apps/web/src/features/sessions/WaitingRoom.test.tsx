import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionDetail } from './useSessionDetail';

const start = vi.fn();

vi.mock('./useWaitingRoom', () => ({
  useWaitingRoom: () => ({
    participants: [
      { id: 'leader-1', displayName: 'Joey' },
      { id: 'u2', displayName: 'Alice Smith' },
    ],
    loading: false,
    error: null,
    isLive: true,
  }),
}));

vi.mock('./useStartSession', () => ({
  useStartSession: () => ({ start, starting: false, error: null }),
}));

vi.mock('./useEndSession', () => ({
  useEndSession: () => ({ end: vi.fn(), ending: false, error: null }),
}));

vi.mock('../../lib/currentUser', () => ({
  useCurrentUserId: () => 'leader-1',
}));

const { WaitingRoom } = await import('./WaitingRoom');

const session: SessionDetail = {
  id: 's1',
  code: '9FFH-BQWB',
  title: 'Random session',
  leaderId: 'leader-1',
  status: 'lobby',
  createdAt: new Date('2026-09-05T00:00:00.000Z'),
  startedAt: null,
  endedAt: null,
  questions: [
    {
      id: 'q1',
      sessionId: 's1',
      text: 'Question 1',
      position: 0,
      status: 'pending',
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
    },
  ],
};

describe('WaitingRoom', () => {
  beforeEach(() => {
    start.mockReset();
  });

  it('puts invite on the left, questions on the right, and start in the table', () => {
    render(<WaitingRoom session={session} onStarted={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Random session' })).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveValue('9FFH-BQWB');
    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start session' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End session' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Joey, Leader' })).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Joey' })).not.toBeInTheDocument();
  });
});

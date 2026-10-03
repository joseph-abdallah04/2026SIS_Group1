import type { BoardItem, BoardResponse } from '@roundtable/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import type { SessionDetail } from './useSessionDetail';

const get = vi.fn();

vi.mock('../../lib/api', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}));
vi.mock('../../lib/currentUser', () => ({
  useCurrentUserId: () => 'leader-1',
}));

const { SessionArchive } = await import('./SessionArchive');

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function sticky(id: string, questionId: string, text: string): BoardItem {
  return {
    id,
    questionId,
    authorId: 'u1',
    authorName: 'Alice',
    type: 'sticky',
    artifactJson: { type: 'sticky', text, color: 'yellow' },
    x: 40,
    y: 40,
    createdAt: '2026-09-01T00:00:00.000Z',
    z: 0,
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
    reactions: [],
  };
}

function board(questionId: string, text: string, note: string): BoardResponse {
  return {
    sessionId: 's1',
    sessionTitle: 'Roadmap',
    leaderId: 'leader-1',
    questionId,
    questionText: text,
    questionPosition: questionId === 'q1' ? 0 : 1,
    questionStatus: 'discussion',
    boardLocked: true,
    items: [sticky(questionId === 'q1' ? 'p1' : 'p2', questionId, note)],
    discussionTimer: null,
  };
}

const SESSION: SessionDetail = {
  id: 's1',
  code: null,
  title: 'Roadmap',
  leaderId: 'leader-1',
  status: 'ended',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  startedAt: new Date('2026-09-01T01:00:00.000Z'),
  endedAt: new Date('2026-09-01T02:00:00.000Z'),
  discussionTimerSeconds: null,
  votingTimerSeconds: null,
  questions: [
    {
      id: 'q2',
      sessionId: 's1',
      text: 'What next?',
      position: 1,
      status: 'discussion',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    },
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

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((path: string) => {
    if (String(path).includes('/outcomes')) return Promise.resolve([]);
    if (String(path).includes('questionId=q2')) {
      return Promise.resolve(board('q2', 'What next?', 'Second board'));
    }
    return Promise.resolve(board('q1', 'What ships first?', 'Ship the pinboard'));
  });
});

function renderArchive() {
  return render(
    <MemoryRouter initialEntries={['/sessions/s1?view=boards&question=q1']}>
      <SessionArchive session={SESSION} />
    </MemoryRouter>,
  );
}

describe('SessionArchive', () => {
  it('shows the selected question’s board and no live controls', async () => {
    renderArchive();

    expect(await screen.findByText('Ship the pinboard')).toBeInTheDocument();
    expect(screen.getByText(/board is read-only/i)).toBeInTheDocument();
    expect(screen.getByText('Session ended')).toBeInTheDocument();
    // On the step, as in the live agenda.
    expect(screen.getByRole('button', { name: 'What ships first?' }).closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('button', { name: 'What next?' }).closest('li')).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByText('Not voted on')).toBeInTheDocument();
    // The same progress track as the live agenda. The question left in
    // discussion when the session ended is unfinished, not done.
    expect(screen.getByRole('progressbar', { name: 'Agenda progress' })).toHaveAttribute(
      'aria-valuetext',
      '1 of 2 questions done',
    );
    // Resizing is a layout preference, not a write, so the archive keeps it.
    expect(screen.getByRole('separator', { name: 'Resize questions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'End session' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave session' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start discussion' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip question' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sticky' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More reactions' })).not.toBeInTheDocument();
    expect(screen.queryByText('live')).not.toBeInTheDocument();
    expect(screen.queryByText('offline')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to summary' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByText('Winner')).not.toBeInTheDocument();
    expect(screen.queryByText('Shortlisted')).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      '/api/sessions/s1/proposals?questionId=q1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('loads the next question when it is chosen, in agenda order', async () => {
    renderArchive();
    await screen.findByText('Ship the pinboard');

    const questions = screen.getAllByRole('button', { name: /What / });
    expect(questions.map((button) => button.textContent)).toEqual([
      'What ships first?',
      'What next?',
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'What next?' }));

    expect(await screen.findByText('Second board')).toBeInTheDocument();
    expect(screen.queryByText('Ship the pinboard')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        '/api/sessions/s1/proposals?questionId=q2',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  it('marks the shortlist and the winner, and leaves the other cards plain', async () => {
    get.mockImplementation((path: string) => {
      if (String(path).includes('/outcomes')) {
        return Promise.resolve([
          {
            questionId: 'q1',
            proposalIds: ['p-win', 'p-short'],
            winnerProposalId: 'p-win',
            tiedProposalIds: [],
          },
        ]);
      }
      return Promise.resolve({
        ...board('q1', 'What ships first?', 'ignored'),
        items: [
          sticky('p-win', 'q1', 'The winner'),
          sticky('p-short', 'q1', 'Also shortlisted'),
          sticky('p-rest', 'q1', 'Just an idea'),
        ],
      });
    });

    renderArchive();

    expect(await screen.findByText('Winner')).toBeInTheDocument();
    expect(screen.getByText('The winner')).toBeInTheDocument();
    expect(screen.getByText('Shortlisted')).toBeInTheDocument();
    expect(screen.getByText('Just an idea')).toBeInTheDocument();
    expect(screen.getAllByText('Winner')).toHaveLength(1);
    expect(screen.getAllByText('Shortlisted')).toHaveLength(1);
  });

  it('marks a tie without calling either card the winner', async () => {
    get.mockImplementation((path: string) => {
      if (String(path).includes('/outcomes')) {
        return Promise.resolve([
          {
            questionId: 'q1',
            proposalIds: ['p-a', 'p-b'],
            winnerProposalId: null,
            tiedProposalIds: ['p-a', 'p-b'],
          },
        ]);
      }
      return Promise.resolve({
        ...board('q1', 'What ships first?', 'ignored'),
        items: [sticky('p-a', 'q1', 'First tie'), sticky('p-b', 'q1', 'Second tie')],
      });
    });

    renderArchive();

    expect(await screen.findAllByText('Tied')).toHaveLength(2);
    expect(screen.getByText('First tie')).toBeInTheDocument();
    expect(screen.queryByText('Winner')).not.toBeInTheDocument();
    expect(screen.queryByText('Shortlisted')).not.toBeInTheDocument();
  });
});

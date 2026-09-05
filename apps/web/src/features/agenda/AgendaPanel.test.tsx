import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Question, QuestionStatus } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('../../lib/api', () => ({
  api: { post: (...args: unknown[]) => post(...args) },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string,
    ) {
      super(message);
    }
  },
}));

const { AgendaPanel } = await import('./AgendaPanel');
const { ApiClientError } = await import('../../lib/api');

function question(position: number, status: QuestionStatus): Question {
  return {
    id: `q${position + 1}`,
    sessionId: 's1',
    text: `Question ${position + 1}`,
    position,
    status,
    createdAt: '2026-09-04T00:00:00.000Z' as unknown as Question['createdAt'],
  };
}

function renderPanel({
  questions,
  activeQuestionId,
  isLeader = true,
}: {
  questions: Question[];
  activeQuestionId: string | null;
  isLeader?: boolean;
}) {
  return render(
    <AgendaPanel
      sessionId="s1"
      questions={questions}
      activeQuestionId={activeQuestionId}
      isLeader={isLeader}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({});
});

describe('AgendaPanel (F24)', () => {
  it('numbers the questions in agenda order and marks finished ones', () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'discussion'), question(2, 'pending')],
      activeQuestionId: 'q2',
    });

    expect(screen.getByText('Agenda 2/3')).toBeInTheDocument();
    expect(screen.getByText('Answered')).toBeInTheDocument();
    expect(screen.getByText('Discussing')).toBeInTheDocument();
    // The current question is the one the board is showing, marked for
    // assistive tech as the current step rather than only by colour.
    expect(screen.getByText('Question 2').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('ticks an answered question and strikes through a skipped one', () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'skipped')],
      activeQuestionId: null,
    });

    expect(screen.getByText('Question 1')).not.toHaveClass('line-through');
    expect(screen.getByText('Question 2')).toHaveClass('line-through');
    expect(screen.getByText('Answered')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
  });

  it('collapses to a rail that still says where the session is up to', async () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending')],
      activeQuestionId: 'q1',
    });

    await userEvent.click(screen.getByLabelText('Collapse agenda'));

    expect(screen.queryByText('Question 1')).not.toBeInTheDocument();
    expect(screen.getByText('Agenda 1/2')).toBeInTheDocument();
    expect(screen.getByLabelText('Expand agenda')).toBeInTheDocument();
  });
});

describe('AgendaPanel leader controls (F25/F26)', () => {
  it('shows a participant the agenda but no controls', () => {
    renderPanel({
      questions: [question(0, 'discussion')],
      activeQuestionId: 'q1',
      isLeader: false,
    });

    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open voting' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip question' })).not.toBeInTheDocument();
  });

  it.each([
    ['pending', 'Start discussion', 'discussion'],
    ['discussion', 'Open voting', 'voting'],
    ['voting', 'Mark answered', 'answered'],
  ] as const)('offers the next step from %s and sends it', async (status, label, sent) => {
    renderPanel({ questions: [question(0, status)], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: label }));

    expect(post).toHaveBeenCalledWith('/api/sessions/s1/phase', {
      questionId: 'q1',
      status: sent,
    });
  });

  // The status arrives on the `sessionPhase` broadcast, so a panel that
  // re-rendered itself would be guessing at the server's answer.
  it('does not move the question locally — the broadcast does that', async () => {
    renderPanel({ questions: [question(0, 'discussion')], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: 'Open voting' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(screen.getByText('Discussing')).toBeInTheDocument();
  });

  it('offers no controls on a question that is not the current one', () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending')],
      activeQuestionId: 'q1',
    });

    // One set of controls only: "Start discussion" on question 2 could only
    // ever fail, since question 1 is still open.
    expect(screen.getAllByRole('button', { name: 'Skip question' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Start discussion' })).not.toBeInTheDocument();
  });

  it('offers no controls on a finished question', () => {
    renderPanel({ questions: [question(0, 'answered')], activeQuestionId: 'q1' });
    expect(screen.queryByRole('button', { name: 'Skip question' })).not.toBeInTheDocument();
  });

  it('keeps phase controls on the open question while the board looks back', () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'discussion')],
      activeQuestionId: 'q1',
    });

    expect(screen.getByRole('button', { name: 'Open voting' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start discussion' })).not.toBeInTheDocument();
  });

  it('asks the server to focus a finished question when the leader clicks it', async () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'discussion')],
      activeQuestionId: 'q2',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Question 1' }));

    expect(post).toHaveBeenCalledWith('/api/sessions/s1/focus', { questionId: 'q1' });
  });

  it('asks before skipping, because a skipped question cannot be reopened', async () => {
    renderPanel({ questions: [question(0, 'discussion')], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: 'Skip question' }));
    expect(post).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(post).toHaveBeenCalledWith('/api/sessions/s1/phase', {
      questionId: 'q1',
      status: 'skipped',
    });
  });

  it('cancelling the skip confirmation sends nothing', async () => {
    renderPanel({ questions: [question(0, 'discussion')], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: 'Skip question' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Skip question' })).toBeInTheDocument();
  });

  it('surfaces the server’s reason for refusing a transition', async () => {
    post.mockRejectedValueOnce(
      new ApiClientError(409, 'Question 1 is still open — answer or skip it first'),
    );
    renderPanel({ questions: [question(0, 'pending')], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: 'Start discussion' }));

    expect(
      await screen.findByText('Question 1 is still open — answer or skip it first'),
    ).toBeInTheDocument();
  });

  it('tells the leader the agenda is finished once nothing is left', () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'skipped')],
      activeQuestionId: null,
    });

    expect(screen.getByText(/end the session when you/)).toBeInTheDocument();
  });
});

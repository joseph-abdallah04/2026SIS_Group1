import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Question, QuestionStatus, VotingPhase } from '@roundtable/shared';
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
  votingPhase,
  hasProposals,
  boardLock,
}: {
  questions: Question[];
  activeQuestionId: string | null;
  isLeader?: boolean;
  votingPhase?: VotingPhase;
  hasProposals?: boolean;
  boardLock?: { locked: boolean; onToggle?: () => Promise<void> };
}) {
  return render(
    <AgendaPanel
      sessionId="s1"
      questions={questions}
      activeQuestionId={activeQuestionId}
      isLeader={isLeader}
      votingPhase={votingPhase}
      hasProposals={hasProposals}
      boardLock={boardLock}
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

    expect(screen.getByRole('complementary', { name: 'Agenda' })).toBeInTheDocument();
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
      questions: [question(0, 'answered'), question(1, 'discussion'), question(2, 'pending')],
      activeQuestionId: 'q2',
    });

    await userEvent.click(screen.getByLabelText('Collapse agenda'));

    expect(screen.queryByText('Question 1')).not.toBeInTheDocument();
    expect(screen.getByText('Agenda')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Agenda progress' })).toHaveAttribute(
      'aria-valuetext',
      '1 of 3 questions done',
    );
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByLabelText('Expand agenda')).toBeInTheDocument();
  });

  // Progress is how much of the agenda is finished, not which question the
  // board is showing: looking back at question 1 does not undo question 2.
  it('counts finished questions, skipped ones included, whatever the board is showing', () => {
    renderPanel({
      questions: [
        question(0, 'answered'),
        question(1, 'skipped'),
        question(2, 'discussion'),
        question(3, 'pending'),
      ],
      activeQuestionId: 'q1',
    });

    const progress = screen.getByRole('progressbar', { name: 'Agenda progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '2');
    expect(progress).toHaveAttribute('aria-valuemax', '4');
    expect(progress).toHaveAttribute('aria-valuetext', '2 of 4 questions done, 1 skipped');
    expect(screen.getByText('1 skipped')).toBeInTheDocument();
  });

  it('says so when every question is finished', () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'skipped')],
      activeQuestionId: null,
    });

    expect(screen.getByText('All done')).toBeInTheDocument();
  });

  it('marks where the board is looking when another question is still in play', () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'discussion')],
      activeQuestionId: 'q1',
    });

    expect(screen.getByText('Question 1').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Viewing').closest('li')).toBe(
      screen.getByText('Question 1').closest('li'),
    );
    // The question in play keeps its status, and nothing says "Viewing" once
    // the board is back on it.
    expect(screen.getByText('Discussing').closest('li')).toBe(
      screen.getByText('Question 2').closest('li'),
    );
  });

  it('leaves a finished question’s status to its node, and says it to screen readers', () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'answered'), question(2, 'discussion')],
      activeQuestionId: 'q2',
    });

    const [inList, onCard] = screen.getAllByText('Answered');
    expect(inList).toHaveClass('sr-only');
    expect(screen.getByText('Question 1')).toHaveClass('line-clamp-2');
    // The card on screen keeps its chip and its whole text.
    expect(onCard).not.toHaveClass('sr-only');
    expect(screen.getByText('Question 2')).not.toHaveClass('line-clamp-2');
  });

  it('scrolls the question the board moves to into view', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const { rerender } = renderPanel({
        questions: [question(0, 'answered'), question(1, 'discussion')],
        activeQuestionId: 'q1',
      });
      scrollIntoView.mockClear();

      rerender(
        <AgendaPanel
          sessionId="s1"
          questions={[question(0, 'answered'), question(1, 'discussion')]}
          activeQuestionId="q2"
          isLeader
        />,
      );

      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByText('Question 2').closest('li'));
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it('does not say "Viewing" when the board is on the question in play', () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'discussion')],
      activeQuestionId: 'q2',
    });

    expect(screen.queryByText('Viewing')).not.toBeInTheDocument();
  });

  it('shows a participant the questions as text, not buttons', () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'discussion')],
      activeQuestionId: 'q2',
      isLeader: false,
    });

    expect(screen.queryByRole('button', { name: 'Question 1' })).not.toBeInTheDocument();
    expect(screen.getByText('Question 1').tagName).toBe('P');
  });

  it('can be dragged wider, for participants as well as the leader', () => {
    renderPanel({
      questions: [question(0, 'discussion')],
      activeQuestionId: 'q1',
      isLeader: false,
    });

    expect(screen.getByRole('separator', { name: 'Resize agenda' })).toBeInTheDocument();
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
  ] as const)('offers the next step from %s and sends it', async (status, label, sent) => {
    renderPanel({ questions: [question(0, status)], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: label }));

    expect(post).toHaveBeenCalledWith('/api/sessions/s1/phase', {
      questionId: 'q1',
      status: sent,
    });
  });

  it('does not offer Mark answered during voting — ending the vote does that', () => {
    renderPanel({ questions: [question(0, 'voting')], activeQuestionId: 'q1' });

    expect(screen.queryByRole('button', { name: 'Mark answered' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip question' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to discussion' })).toBeInTheDocument();
  });

  it('lets the leader leave shortlisting and return to discussion', async () => {
    renderPanel({
      questions: [question(0, 'voting')],
      activeQuestionId: 'q1',
      votingPhase: 'shortlisting',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Back to discussion' }));

    expect(post).toHaveBeenCalledWith('/api/sessions/s1/phase', {
      questionId: 'q1',
      status: 'discussion',
    });
  });

  it('does not offer a way back once the ballot is open', () => {
    renderPanel({
      questions: [question(0, 'voting')],
      activeQuestionId: 'q1',
      votingPhase: 'open',
    });

    expect(screen.queryByRole('button', { name: 'Back to discussion' })).not.toBeInTheDocument();
  });

  it('does not offer Open voting without enough proposals to shortlist', async () => {
    renderPanel({
      questions: [question(0, 'discussion')],
      activeQuestionId: 'q1',
      hasProposals: false,
    });

    expect(screen.getByRole('button', { name: 'Open voting' })).toBeDisabled();
    // Said in the card, not only in a tooltip a pointer has to find.
    expect(screen.getByText('Needs 2 proposals on the board first')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open voting' }));
    expect(post).not.toHaveBeenCalled();
  });

  it('hides Skip while the ballot is showing the result', () => {
    renderPanel({
      questions: [question(0, 'voting')],
      activeQuestionId: 'q1',
      votingPhase: 'closed',
    });

    expect(screen.getByText('Results')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip question' })).not.toBeInTheDocument();
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

  it('lets the leader type a question into the agenda and posts it', async () => {
    renderPanel({
      questions: [question(0, 'discussion')],
      activeQuestionId: 'q1',
    });

    await userEvent.type(screen.getByLabelText('New question'), 'What did we miss?');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/sessions/s1/questions', {
        text: 'What did we miss?',
      }),
    );
    expect(screen.queryByDisplayValue('What did we miss?')).not.toBeInTheDocument();
    expect(screen.queryByText('What did we miss?')).not.toBeInTheDocument();
  });

  it('does not offer the add field to a participant', () => {
    renderPanel({
      questions: [question(0, 'discussion')],
      activeQuestionId: 'q1',
      isLeader: false,
    });

    expect(screen.queryByLabelText('New question')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  it('does not post a blank question', async () => {
    renderPanel({
      questions: [question(0, 'discussion')],
      activeQuestionId: 'q1',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(post).not.toHaveBeenCalled();
  });
});

// Each question has its own board lock, so the control sits with the question,
// and only while it is being discussed: the only time anything on it can move.
describe('AgendaPanel board lock', () => {
  it('offers the leader the lock under the question being discussed', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn(async () => {});
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending')],
      activeQuestionId: 'q1',
      boardLock: { locked: true, onToggle },
    });

    await user.click(screen.getByRole('button', { name: 'Board locked' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('shows a member the state, with nothing to press', () => {
    renderPanel({
      questions: [question(0, 'discussion')],
      activeQuestionId: 'q1',
      isLeader: false,
      boardLock: { locked: true },
    });

    expect(screen.queryByRole('button', { name: /board (un)?locked/i })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Only the leader can move proposals');
  });

  it.each(['voting', 'answered'] as const)(
    'is not offered once the question is %s and nothing on it can move',
    (status) => {
      renderPanel({
        questions: [question(0, status)],
        activeQuestionId: 'q1',
        votingPhase: 'shortlisting',
        boardLock: { locked: true, onToggle: vi.fn(async () => {}) },
      });

      expect(screen.queryByRole('button', { name: /board (un)?locked/i })).toBeNull();
    },
  );

  it('says why, when the lock could not be changed', async () => {
    const user = userEvent.setup();
    renderPanel({
      questions: [question(0, 'discussion')],
      activeQuestionId: 'q1',
      boardLock: {
        locked: true,
        onToggle: vi.fn(async () => {
          throw new Error('Only the session leader can lock the board');
        }),
      },
    });

    await user.click(screen.getByRole('button', { name: 'Board locked' }));
    expect(
      await screen.findByText('Only the session leader can lock the board'),
    ).toBeInTheDocument();
  });
});

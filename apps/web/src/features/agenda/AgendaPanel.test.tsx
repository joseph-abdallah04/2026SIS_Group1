import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Question, QuestionStatus, VotingPhase } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
const patch = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    post: (...args: unknown[]) => post(...args),
    patch: (...args: unknown[]) => patch(...args),
  },
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

function question(position: number, status: QuestionStatus, votingEnabled = true): Question {
  return {
    id: `q${position + 1}`,
    sessionId: 's1',
    text: `Question ${position + 1}`,
    position,
    status,
    votingEnabled,
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
  patch.mockResolvedValue({});
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
    expect(progress).toHaveAttribute(
      'aria-valuetext',
      '2 of 4 questions done, including 1 skipped',
    );
    expect(screen.getByText('1 answered · 1 skipped')).toBeInTheDocument();
    // Named by the question in play, not the one the board is looking back at.
    expect(screen.getByText('Question', { selector: 'span' })).toHaveTextContent('Question 3 of 4');
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

  it('scrolls the agenda list, and only the list, to the question the board moves to', () => {
    const { rerender } = renderPanel({
      questions: [question(0, 'answered'), question(1, 'discussion')],
      activeQuestionId: 'q1',
    });
    const step = screen.getByText('Question 2').closest('li')!;
    const list = step.parentElement!;
    // jsdom lays nothing out: the list shows 100–300, the step sits at 340–400.
    list.getBoundingClientRect = () => new DOMRect(0, 100, 200, 200);
    step.getBoundingClientRect = () => new DOMRect(0, 340, 200, 60);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      rerender(
        <AgendaPanel
          sessionId="s1"
          questions={[question(0, 'answered'), question(1, 'discussion')]}
          activeQuestionId="q2"
          isLeader
        />,
      );

      // Just far enough for its foot to clear the bottom of the list.
      expect(list.scrollTop).toBe(100);
      // Never `scrollIntoView`, which would also scroll the page's hidden-overflow boxes.
      expect(scrollIntoView).not.toHaveBeenCalled();
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
    // Said on the button, not only in a tooltip a pointer has to find.
    expect(screen.getByRole('button', { name: 'Open voting' })).toHaveAccessibleDescription(
      'Needs 2 proposals',
    );
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

    await userEvent.click(screen.getByRole('button', { name: '+ Add question' }));
    await userEvent.type(screen.getByLabelText('New question'), 'What did we miss?');
    await userEvent.click(screen.getByRole('button', { name: 'Add to agenda' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/sessions/s1/questions', {
        text: 'What did we miss?',
        votingEnabled: true,
      }),
    );
    // The composer closes; the question itself arrives on the broadcast.
    await waitFor(() => expect(screen.queryByLabelText('New question')).not.toBeInTheDocument());
    expect(screen.queryByText('What did we miss?')).not.toBeInTheDocument();
  });

  it('adds the question on Enter and puts the composer away on Escape', async () => {
    renderPanel({ questions: [question(0, 'discussion')], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: '+ Add question' }));
    await userEvent.type(screen.getByLabelText('New question'), 'Who decides?{Enter}');
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/sessions/s1/questions', {
        text: 'Who decides?',
        votingEnabled: true,
      }),
    );

    await userEvent.click(await screen.findByRole('button', { name: '+ Add question' }));
    await userEvent.type(screen.getByLabelText('New question'), 'Never mind{Escape}');
    expect(screen.queryByLabelText('New question')).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not offer the add field to a participant', () => {
    renderPanel({
      questions: [question(0, 'discussion')],
      activeQuestionId: 'q1',
      isLeader: false,
    });

    expect(screen.queryByRole('button', { name: '+ Add question' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New question')).not.toBeInTheDocument();
    expect(screen.queryByText('Leader controls')).not.toBeInTheDocument();
  });

  it('does not post a blank question', async () => {
    renderPanel({
      questions: [question(0, 'discussion')],
      activeQuestionId: 'q1',
    });

    await userEvent.click(screen.getByRole('button', { name: '+ Add question' }));
    expect(screen.getByRole('button', { name: 'Add to agenda' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('New question'), '   {Enter}');
    expect(post).not.toHaveBeenCalled();
  });

  it('says how the question in play is going', () => {
    render(
      <AgendaPanel
        sessionId="s1"
        questions={[question(0, 'answered'), question(1, 'discussion')]}
        activeQuestionId="q2"
        isLeader={false}
        proposalCount={5}
      />,
    );

    expect(screen.getByText('5 proposals')).toBeInTheDocument();
  });

  it('counts down on the button how many more proposals voting needs', () => {
    render(
      <AgendaPanel
        sessionId="s1"
        questions={[question(0, 'discussion')]}
        activeQuestionId="q1"
        isLeader
        proposalCount={1}
        hasProposals={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Open voting' })).toHaveAccessibleDescription(
      '1 more proposal needed',
    );
    // The card just counts.
    expect(screen.getByText('1 proposal')).toBeInTheDocument();
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

describe('AgendaPanel brainstorm-only questions (F41)', () => {
  it('offers Finish discussion instead of Open voting, and answers the question', async () => {
    renderPanel({ questions: [question(0, 'discussion', false)], activeQuestionId: 'q1' });

    expect(screen.queryByRole('button', { name: 'Open voting' })).not.toBeInTheDocument();
    expect(screen.getByText('Brainstorming')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Finish discussion' }));

    expect(post).toHaveBeenCalledWith('/api/sessions/s1/phase', {
      questionId: 'q1',
      status: 'answered',
    });
  });

  it('does not hold Finish discussion back for an empty board — there is no shortlist to fill', () => {
    renderPanel({
      questions: [question(0, 'discussion', false)],
      activeQuestionId: 'q1',
      hasProposals: false,
    });

    expect(screen.getByRole('button', { name: 'Finish discussion' })).toBeEnabled();
  });

  it('labels a finished brainstorm Discussed, not Answered', () => {
    renderPanel({
      questions: [question(0, 'answered', false), question(1, 'answered')],
      activeQuestionId: null,
    });

    expect(screen.getByText('Discussed')).toBeInTheDocument();
    expect(screen.getByText('Answered')).toBeInTheDocument();
  });

  it('lets the leader turn the next question into a brainstorm before it starts', async () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'pending')],
      activeQuestionId: 'q1',
    });

    const toggle = screen.getByRole('button', { name: 'Vote on question 2' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(toggle);

    expect(patch).toHaveBeenCalledWith('/api/sessions/s1/questions/q2', {
      votingEnabled: false,
    });
  });

  it('keeps the rows still to come compact while another question is open', () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending'), question(2, 'pending', false)],
      activeQuestionId: 'q1',
    });

    // The switch rides on the open question only.
    expect(screen.getByRole('button', { name: 'Vote on question 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vote on question 2' })).not.toBeInTheDocument();
    // A brainstorm further down still says so.
    expect(screen.getByText('No vote').closest('li')).toBe(
      screen.getByText('Question 3').closest('li'),
    );
  });

  it('opens a question still to come in place when the leader clicks it, with its vote switch', async () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending'), question(2, 'pending')],
      activeQuestionId: 'q1',
    });

    const row = screen.getByRole('button', { name: 'Question 3' });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Vote on question 3' }));
    expect(patch).toHaveBeenCalledWith('/api/sessions/s1/questions/q3', {
      votingEnabled: false,
    });
    // Opened here only: the room's board stays where it is.
    expect(post).not.toHaveBeenCalledWith('/api/sessions/s1/focus', expect.anything());

    await userEvent.click(row);
    expect(screen.queryByRole('button', { name: 'Vote on question 3' })).not.toBeInTheDocument();
  });

  it('lets the leader turn the vote back on mid-discussion', async () => {
    renderPanel({ questions: [question(0, 'discussion', false)], activeQuestionId: 'q1' });

    const toggle = screen.getByRole('button', { name: 'Vote on question 1' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);

    expect(patch).toHaveBeenCalledWith('/api/sessions/s1/questions/q1', { votingEnabled: true });
  });

  it.each(['voting', 'answered', 'skipped'] as const)(
    'offers no vote switch once a question is %s',
    (status) => {
      renderPanel({ questions: [question(0, status)], activeQuestionId: 'q1' });
      expect(screen.queryByRole('button', { name: 'Vote on question 1' })).not.toBeInTheDocument();
    },
  );

  it('shows a participant which questions will not be voted on, with no switch', () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending', false)],
      activeQuestionId: 'q1',
      isLeader: false,
    });

    expect(screen.getAllByText('No vote')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Vote on question/ })).not.toBeInTheDocument();
  });

  it('shows the server refusing a late switch', async () => {
    patch.mockRejectedValueOnce(
      new ApiClientError(
        409,
        'Voting has already opened on this question',
        'QUESTION_VOTING_LOCKED',
      ),
    );
    renderPanel({ questions: [question(0, 'discussion')], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: 'Vote on question 1' }));

    expect(
      await screen.findByText('Voting has already opened on this question'),
    ).toBeInTheDocument();
  });

  // Both decide on the same row, so the leader cannot start one while the
  // other is still on its way (the server also refuses whichever loses).
  it('holds Open voting while the vote switch is still being saved', async () => {
    patch.mockReturnValueOnce(new Promise(() => {}));
    renderPanel({ questions: [question(0, 'discussion')], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: 'Vote on question 1' }));

    expect(screen.getByRole('button', { name: 'Open voting' })).toBeDisabled();
  });

  it('holds the vote switch while a phase change is still being saved', async () => {
    post.mockReturnValueOnce(new Promise(() => {}));
    renderPanel({ questions: [question(0, 'discussion', false)], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: 'Finish discussion' }));

    expect(screen.getByRole('button', { name: 'Vote on question 1' })).toBeDisabled();
  });

  it('adds a brainstorm-only question when the leader turns its vote off first', async () => {
    renderPanel({ questions: [question(0, 'discussion')], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: '+ Add question' }));
    await userEvent.type(screen.getByLabelText('New question'), 'Any wild ideas?');
    await userEvent.click(screen.getByRole('button', { name: 'Brainstorm' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to agenda' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/sessions/s1/questions', {
        text: 'Any wild ideas?',
        votingEnabled: false,
      }),
    );
    // Back to the default for the next one.
    await userEvent.click(await screen.findByRole('button', { name: '+ Add question' }));
    expect(screen.getByRole('button', { name: 'Vote' })).toHaveAttribute('aria-pressed', 'true');
  });
});

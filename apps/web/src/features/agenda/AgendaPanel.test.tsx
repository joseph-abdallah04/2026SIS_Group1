import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Question, QuestionStatus, VotingPhase } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
const patch = vi.fn();
const put = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    post: (...args: unknown[]) => post(...args),
    patch: (...args: unknown[]) => patch(...args),
    put: (...args: unknown[]) => put(...args),
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

/**
 * A question's row in the agenda list. The leader's footer names the question
 * it acts on too, so a bare text lookup can find two.
 */
const inList = (text: string) => within(screen.getByRole('list')).getByText(text);

/** Opens a question to edit, picks how it ends, and saves. */
async function endsWith(choice: 'A vote' | 'Brainstorm', number = 1) {
  await userEvent.click(screen.getByRole('button', { name: `Edit question ${number}` }));
  await userEvent.click(screen.getByRole('radio', { name: choice }));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
}

function renderPanel({
  questions,
  activeQuestionId,
  isLeader = true,
  votingPhase,
  hasProposals,
}: {
  questions: Question[];
  activeQuestionId: string | null;
  isLeader?: boolean;
  votingPhase?: VotingPhase;
  hasProposals?: boolean;
}) {
  return render(
    <AgendaPanel
      sessionId="s1"
      questions={questions}
      activeQuestionId={activeQuestionId}
      isLeader={isLeader}
      votingPhase={votingPhase}
      hasProposals={hasProposals}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({});
  patch.mockResolvedValue({});
  put.mockResolvedValue({});
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
    expect(inList('Question 2').closest('li')).toHaveAttribute('aria-current', 'step');
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

    // The card stays on the question in play; the board looking back is said.
    expect(inList('Question 2').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Viewing').closest('li')).toBe(inList('Question 1').closest('li'));
    expect(screen.getByText('Discussing').closest('li')).toBe(inList('Question 2').closest('li'));
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
      activeQuestionId: 'q2',
    });
    const step = inList('Question 1').closest('li')!;
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
          activeQuestionId="q1"
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
    expect(screen.getByRole('button', { name: 'Back to discussion' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip question' })).toBeInTheDocument();
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
    // Nothing left to do on it from the agenda, so no ⋯ at all.
    expect(screen.queryByRole('button', { name: 'Question 1 options' })).not.toBeInTheDocument();
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

    // One primary step only: "Start discussion" on question 2 could only ever
    // fail, since question 1 is still open.
    expect(screen.getByRole('button', { name: 'Open voting' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start discussion' })).not.toBeInTheDocument();
  });

  it('offers no controls on a finished question', () => {
    renderPanel({ questions: [question(0, 'answered')], activeQuestionId: 'q1' });
    expect(screen.queryByRole('button', { name: 'Question 1 options' })).not.toBeInTheDocument();
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
    expect(screen.getByText('Skip Q1?')).toBeInTheDocument();

    // The confirmation's own button skips it.
    await userEvent.click(screen.getByRole('button', { name: 'Skip question' }));
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
    expect(screen.queryByText('Skip Q1?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open voting' })).toBeInTheDocument();
  });

  it('surfaces the server’s reason for refusing a transition', async () => {
    post.mockRejectedValueOnce(
      new ApiClientError(409, 'Question 1 is still open. Answer or skip it first'),
    );
    renderPanel({ questions: [question(0, 'pending')], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: 'Start discussion' }));

    expect(
      await screen.findByText('Question 1 is still open. Answer or skip it first'),
    ).toBeInTheDocument();
  });

  it('tells the leader the agenda is finished once nothing is left', () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'skipped')],
      activeQuestionId: null,
    });

    expect(screen.getByText(/end the session when you/i)).toBeInTheDocument();
  });

  it('lets the leader type a question into the agenda and posts it', async () => {
    renderPanel({
      questions: [question(0, 'discussion')],
      activeQuestionId: 'q1',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
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

    await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
    await userEvent.type(screen.getByLabelText('New question'), 'Who decides?{Enter}');
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/sessions/s1/questions', {
        text: 'Who decides?',
        votingEnabled: true,
      }),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Add question' }));
    await userEvent.type(screen.getByLabelText('New question'), 'Never mind{Escape}');
    expect(screen.queryByLabelText('New question')).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
  });

  // The header's + opens the same place, wherever the list is scrolled.
  it('opens the composer from the header too', async () => {
    renderPanel({ questions: [question(0, 'discussion')], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: 'Add a question' }));

    expect(screen.getByLabelText('New question')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Add a question' })).toBeDisabled();
  });

  it('does not offer the add field to a participant', () => {
    renderPanel({
      questions: [question(0, 'discussion')],
      activeQuestionId: 'q1',
      isLeader: false,
    });

    expect(screen.queryByRole('button', { name: 'Add question' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a question' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New question')).not.toBeInTheDocument();
    expect(screen.queryByText('Leader controls')).not.toBeInTheDocument();
  });

  it('does not post a blank question', async () => {
    renderPanel({
      questions: [question(0, 'discussion')],
      activeQuestionId: 'q1',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
    expect(screen.getByRole('button', { name: 'Add to agenda' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('New question'), '   {Enter}');
    expect(post).not.toHaveBeenCalled();
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

  it('lets the leader turn a question still to come into a brainstorm from its Edit', async () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending')],
      activeQuestionId: 'q1',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit question 2' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Brainstorm' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(patch).toHaveBeenCalledWith('/api/sessions/s1/questions/q2', {
      votingEnabled: false,
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('marks a brainstorm in the list, and shows it as one when edited', async () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending', false)],
      activeQuestionId: 'q1',
    });

    expect(screen.getByText('Brainstorm').closest('li')).toBe(inList('Question 2').closest('li'));
    await userEvent.click(screen.getByRole('button', { name: 'Edit question 2' }));
    expect(screen.getByRole('radio', { name: 'Brainstorm' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  // A question still to come has no board worth putting up yet.
  it('puts a question still to come up to look at when the leader clicks it', async () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending')],
      activeQuestionId: 'q1',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Question 2' }));

    expect(post).toHaveBeenCalledWith('/api/sessions/s1/focus', { questionId: 'q2' });
  });

  it('says a question still to come is being viewed while the room is elsewhere', () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending')],
      activeQuestionId: 'q2',
    });

    expect(screen.getByText('Viewing').closest('li')).toBe(inList('Question 2').closest('li'));
  });

  it('lets the leader turn the vote back on mid-discussion, from the card', async () => {
    renderPanel({ questions: [question(0, 'discussion', false)], activeQuestionId: 'q1' });

    await endsWith('A vote');

    expect(patch).toHaveBeenCalledWith('/api/sessions/s1/questions/q1', { votingEnabled: true });
  });

  it.each(['voting', 'answered', 'skipped'] as const)(
    'offers no vote change once a question is %s',
    (status) => {
      renderPanel({ questions: [question(0, status)], activeQuestionId: 'q1' });
      expect(screen.queryByRole('button', { name: 'Edit question 1' })).not.toBeInTheDocument();
    },
  );

  it('says brainstorm once on a brainstorm under way', () => {
    renderPanel({ questions: [question(0, 'discussion', false)], activeQuestionId: 'q1' });

    expect(screen.getByText('Brainstorming')).toBeInTheDocument();
    expect(screen.queryByText('Brainstorm')).not.toBeInTheDocument();
  });

  it('shows a participant which questions will not be voted on, with no controls', () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending', false)],
      activeQuestionId: 'q1',
      isLeader: false,
    });

    expect(screen.getAllByText('Brainstorm')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Edit question/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit question/ })).not.toBeInTheDocument();
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

    await endsWith('Brainstorm');

    expect(
      await screen.findByText('Voting has already opened on this question'),
    ).toBeInTheDocument();
  });

  // Both decide on the same question, so the leader cannot start one while
  // the other is still on its way (the server also refuses whichever loses).
  it('holds the editor while the vote change is still being saved', async () => {
    patch.mockReturnValueOnce(new Promise(() => {}));
    renderPanel({ questions: [question(0, 'discussion')], activeQuestionId: 'q1' });

    await endsWith('Brainstorm');

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('holds the vote change while a phase change is still being saved', async () => {
    post.mockReturnValueOnce(new Promise(() => {}));
    renderPanel({ questions: [question(0, 'discussion', false)], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: 'Finish discussion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit question 1' }));

    expect(screen.getByRole('radio', { name: 'A vote' })).toBeDisabled();
  });

  it('adds a brainstorm-only question when the leader turns its vote off first', async () => {
    renderPanel({ questions: [question(0, 'discussion')], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: 'Add question' }));
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
    await userEvent.click(await screen.findByRole('button', { name: 'Add question' }));
    expect(screen.getByRole('button', { name: 'Vote' })).toHaveAttribute('aria-pressed', 'true');
  });
});

// The question the room is on is a card, with the leader's controls on it.
describe('AgendaPanel card', () => {
  it('puts the question in play in the card, with its primary step', () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'discussion'), question(2, 'pending')],
      activeQuestionId: 'q1',
    });

    const card = inList('Question 2').closest('li')!;
    expect(card).toHaveAttribute('aria-current', 'step');
    expect(card).toContainElement(screen.getByRole('button', { name: 'Open voting' }));
    expect(card).toContainElement(screen.getByRole('button', { name: 'Skip question' }));
    expect(card).toContainElement(screen.getByRole('button', { name: 'Edit question 2' }));
  });

  it('marks the question that comes next', () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending'), question(2, 'pending')],
      activeQuestionId: 'q1',
    });

    expect(screen.getByText('Up next').closest('li')).toBe(inList('Question 2').closest('li'));
  });

  it('makes the next question the card when nothing is open', () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'pending')],
      activeQuestionId: 'q1',
    });

    const card = inList('Question 2').closest('li')!;
    expect(card).toHaveAttribute('aria-current', 'step');
    expect(card).toHaveTextContent('Up next');
    expect(card).toContainElement(screen.getByRole('button', { name: 'Start discussion' }));
  });

  it('shows the discussion clock, and no count line under the question', () => {
    render(
      <AgendaPanel
        sessionId="s1"
        questions={[question(0, 'discussion')]}
        activeQuestionId="q1"
        isLeader={false}
        proposalCount={5}
        timer={{
          questionId: 'q1',
          startedAt: new Date().toISOString(),
          durationSeconds: 300,
        }}
      />,
    );

    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(screen.queryByText(/proposals?\b/)).not.toBeInTheDocument();
  });

  // The shortlist is picked on the board, which has its own "Start vote".
  it('steps aside while the shortlist is picked on the board', () => {
    renderPanel({
      questions: [question(0, 'voting')],
      activeQuestionId: 'q1',
      votingPhase: 'shortlisting',
    });

    expect(screen.getByText('Picking the shortlist on the board.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open voting' })).not.toBeInTheDocument();
  });

  it('takes the leader’s shortcut for its one primary action', () => {
    renderPanel({ questions: [question(0, 'pending')], activeQuestionId: 'q1' });

    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });

    expect(post).toHaveBeenCalledWith('/api/sessions/s1/phase', {
      questionId: 'q1',
      status: 'discussion',
    });
  });

  it('leaves the shortcut alone inside a text field, where the sticky editor uses it', async () => {
    renderPanel({ questions: [question(0, 'pending')], activeQuestionId: 'q1' });
    await userEvent.click(screen.getByRole('button', { name: 'Add question' }));

    fireEvent.keyDown(screen.getByLabelText('New question'), { key: 'Enter', ctrlKey: true });

    expect(post).not.toHaveBeenCalledWith('/api/sessions/s1/phase', expect.anything());
  });

  it('gives a participant no shortcut', () => {
    renderPanel({ questions: [question(0, 'pending')], activeQuestionId: 'q1', isLeader: false });

    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });

    expect(post).not.toHaveBeenCalled();
  });
});

// Skipping asks once, since a skipped question cannot be reopened.
describe('AgendaPanel skipping', () => {
  it('skips the question the room is on, once confirmed', async () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending')],
      activeQuestionId: 'q1',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Skip question' }));
    expect(screen.getByText('Skip Q1?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Skip question' }));

    expect(post).toHaveBeenCalledWith('/api/sessions/s1/phase', {
      questionId: 'q1',
      status: 'skipped',
    });
  });

  it('does not offer to skip a question still to come', async () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending')],
      activeQuestionId: 'q1',
    });

    // One Skip only, on the card.
    expect(screen.getAllByRole('button', { name: 'Skip question' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Edit question 2' }));
    const editor = screen.getByLabelText('Question 2').closest('li')!;
    expect(within(editor).queryByText(/^Skip/)).not.toBeInTheDocument();
  });

  it('skips the next question when nothing is open, since that is the one the room is on', async () => {
    renderPanel({
      questions: [question(0, 'answered'), question(1, 'pending'), question(2, 'pending')],
      activeQuestionId: 'q1',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Skip question' }));
    await userEvent.click(screen.getByRole('button', { name: 'Skip question' }));

    expect(post).toHaveBeenCalledWith('/api/sessions/s1/phase', {
      questionId: 'q2',
      status: 'skipped',
    });
  });

  it('shows why a question was skipped, when one was recorded', () => {
    renderPanel({
      questions: [{ ...question(0, 'skipped'), skipReason: 'Out of time' }, question(1, 'pending')],
      activeQuestionId: 'q2',
    });

    expect(screen.getByText('Out of time').closest('li')).toBe(inList('Question 1').closest('li'));
  });

  it('puts the confirmation away on Escape without skipping', async () => {
    renderPanel({ questions: [question(0, 'discussion')], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: 'Skip question' }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByText('Skip Q1?')).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});

// A typo is fixed, not the question removed: the record keeps its place.
describe('AgendaPanel editing a question', () => {
  it('rewords a question still to come from its Edit', async () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending')],
      activeQuestionId: 'q1',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit question 2' }));
    const field = screen.getByLabelText('Question 2');
    await userEvent.clear(field);
    await userEvent.type(field, 'Who signs off?{Enter}');

    expect(post).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/api/sessions/s1/questions/q2/text', {
        text: 'Who signs off?',
      }),
    );
  });

  // The question the room is on can be reworded too, until voting opens.
  it('rewords the question in play from the card', async () => {
    renderPanel({ questions: [question(0, 'discussion')], activeQuestionId: 'q1' });

    await userEvent.click(screen.getByRole('button', { name: 'Edit question 1' }));
    const field = screen.getByLabelText('Question 1');
    await userEvent.clear(field);
    await userEvent.type(field, 'Which segment first?{Enter}');

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/api/sessions/s1/questions/q1/text', {
        text: 'Which segment first?',
      }),
    );
  });

  // Opening the editor leaves the cursor where it was.
  it('opens the editor without moving the cursor into the text box', async () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending')],
      activeQuestionId: 'q1',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit question 2' }));

    expect(screen.getByLabelText('Question 2')).not.toHaveFocus();
  });

  // Questions are skipped, never removed: the agenda keeps its record.
  it('offers no way to delete a question', async () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending')],
      activeQuestionId: 'q1',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit question 2' }));

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('puts the edit away on Escape without saving', async () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending')],
      activeQuestionId: 'q1',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Edit question 2' }));
    await userEvent.type(screen.getByLabelText('Question 2'), ' more{Escape}');

    expect(screen.queryByLabelText('Question 2')).not.toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });
});

// Reordering keeps to questions that have not started: nothing moves above
// what has already happened.
describe('AgendaPanel reordering', () => {
  it('moves a question still to come down with Alt+arrow, past another', async () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending'), question(2, 'pending')],
      activeQuestionId: 'q1',
    });

    screen.getByRole('button', { name: 'Question 2' }).focus();
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
    // Not above the question in play.
    expect(post).not.toHaveBeenCalled();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');

    expect(post).toHaveBeenCalledWith('/api/sessions/s1/questions/q2/move', {
      direction: 'down',
    });
  });

  it('drags a question into another one’s place', () => {
    renderPanel({
      questions: [
        question(0, 'discussion'),
        question(1, 'pending'),
        question(2, 'pending'),
        question(3, 'pending'),
      ],
      activeQuestionId: 'q1',
    });
    const dragged = inList('Question 4').closest('li')!;
    const target = inList('Question 2').closest('li')!;
    // jsdom lays nothing out: give each row a place in the list, so the
    // pointer at y=150 is over question 2's row. The dragged row follows the
    // pointer, so the target has to come from where the other rows sit.
    inList('Question 1').closest('li')!.getBoundingClientRect = () => new DOMRect(0, 0, 200, 90);
    target.getBoundingClientRect = () => new DOMRect(0, 100, 200, 90);
    inList('Question 3').closest('li')!.getBoundingClientRect = () => new DOMRect(0, 200, 200, 90);
    dragged.getBoundingClientRect = () => new DOMRect(0, 300, 200, 90);

    fireEvent.pointerDown(dragged, { button: 0, pointerId: 1, clientY: 300 });
    fireEvent.pointerMove(dragged, { pointerId: 1, clientY: 150 });
    fireEvent.pointerUp(dragged, { pointerId: 1, clientY: 150 });

    expect(post).toHaveBeenCalledWith('/api/sessions/s1/questions/q4/move', {
      toQuestionId: 'q2',
    });
    // The press that ended the drag does not also put the board up.
    fireEvent.click(inList('Question 4'));
    expect(post).not.toHaveBeenCalledWith('/api/sessions/s1/focus', expect.anything());
  });

  // A press that barely moves is still a click on the question.
  it('treats a press that does not travel as a click, not a drag', async () => {
    renderPanel({
      questions: [question(0, 'discussion'), question(1, 'pending'), question(2, 'pending')],
      activeQuestionId: 'q1',
    });
    const row = inList('Question 2').closest('li')!;

    fireEvent.pointerDown(row, { button: 0, pointerId: 1, clientY: 300 });
    fireEvent.pointerMove(row, { pointerId: 1, clientY: 302 });
    fireEvent.pointerUp(row, { pointerId: 1, clientY: 302 });
    await userEvent.click(inList('Question 2'));

    expect(post).toHaveBeenCalledWith('/api/sessions/s1/focus', { questionId: 'q2' });
    expect(post).not.toHaveBeenCalledWith('/api/sessions/s1/questions/q2/move', expect.anything());
  });
});

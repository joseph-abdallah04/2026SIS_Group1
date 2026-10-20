import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SESSION_QUESTION_LIMIT } from '@roundtable/shared/schemas';

import { pasteNoticeText, SessionQuestionsForm, type SetupAction } from './SessionQuestionsForm';
import { BUILT_IN_TEMPLATES, findTemplate } from './templates';

const ACTIONS: SetupAction[] = [
  { kind: 'draft', label: 'Save as draft', busyLabel: 'Saving…' },
  { kind: 'open', label: 'Open the room', busyLabel: 'Opening…', primary: true },
];

type Props = ComponentProps<typeof SessionQuestionsForm>;

function renderForm(props: Partial<Props> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn();
  render(
    <SessionQuestionsForm
      actions={ACTIONS}
      busy={null}
      error={null}
      {...props}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit as ReturnType<typeof vi.fn>;
}

function renderWith(questions: string[], props: Partial<Props> = {}) {
  return renderForm({
    initialTitle: 'Roadmap',
    initialQuestions: questions.map((text) => ({ text, votingEnabled: true })),
    ...props,
  });
}

const title = () => screen.getByLabelText('Session title');
const question = (n: number) => screen.getByRole('textbox', { name: `Question ${n}` });
const open = () => screen.getByRole('button', { name: /Open the room/ });
const questionTexts = () =>
  screen
    .getAllByRole('textbox', { name: /^Question \d+$/ })
    .map((input) => (input as HTMLInputElement).value);

describe('SessionQuestionsForm', () => {
  // A draft saved before the limit came down: its long question is kept, and
  // the draft saves without the leader having to trim it first.
  it('saves a draft whose question was written under the old, longer limit', async () => {
    const user = userEvent.setup();
    const long = 'x'.repeat(300);
    const onSubmit = renderForm({
      editingDraft: true,
      initialTitle: 'Roadmap',
      initialQuestions: [{ text: long, votingEnabled: true }],
      actions: [{ kind: 'save', label: 'Save changes', busyLabel: 'Saving…', primary: true }],
    });

    await user.clear(title());
    await user.type(title(), 'Roadmap v2');
    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Roadmap v2',
        questions: [{ text: long, votingEnabled: true }],
      }),
      'save',
    );
  });

  // Code review: a draft's question written before the limit came down showed
  // a red "300/150", which reads as an error, though it saves.
  it('counts a draft’s older long question without marking it as an error', () => {
    renderForm({
      editingDraft: true,
      initialTitle: 'Roadmap',
      initialQuestions: [{ text: 'x'.repeat(300), votingEnabled: true }],
      actions: [{ kind: 'save', label: 'Save changes', busyLabel: 'Saving…', primary: true }],
    });

    const count = screen.getByText('300/150');
    expect(count).not.toHaveClass('text-red-700');
    expect(count).toHaveAttribute('title', 'Written before the limit came down: it still saves');
  });

  it('marks a new session’s question as too long only past the limit', async () => {
    const user = userEvent.setup();
    renderWith(['x'.repeat(149)]);

    await user.type(question(1), 'y');
    expect(screen.getByText('150/150')).not.toHaveClass('text-red-700');
  });

  it('names the question that is too long when creating a session', async () => {
    const user = userEvent.setup();
    const onSubmit = renderWith(['Fine', 'x'.repeat(200)]);

    await user.click(open());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Question 2 is longer than 150 characters');
  });

  it('keeps both buttons disabled, and says why, until there is a title and a question', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    expect(open()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save as draft' })).toBeDisabled();
    expect(screen.getByText('Name the session to continue')).toBeInTheDocument();

    await user.type(title(), 'Roadmap');
    expect(open()).toBeDisabled();
    expect(screen.getByText('Add a question to continue')).toBeInTheDocument();

    await user.type(question(1), 'What ships first?');
    expect(open()).toBeEnabled();

    await user.click(open());
    expect(onSubmit).toHaveBeenCalledWith(
      {
        title: 'Roadmap',
        questions: [{ text: 'What ships first?', votingEnabled: true }],
        discussionTimerSeconds: null,
        votingTimerSeconds: null,
        voiceEnabled: false,
      },
      'open',
    );
  });

  it('says which button sent it', async () => {
    const user = userEvent.setup();
    const onSubmit = renderWith(['What ships first?']);

    await user.click(screen.getByRole('button', { name: 'Save as draft' }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.anything(), 'draft');
  });

  it('shows the busy button’s own label and holds both while it is on its way', () => {
    renderWith(['What ships first?'], { busy: 'open' });

    expect(screen.getByRole('button', { name: 'Opening…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save as draft' })).toBeDisabled();
  });

  it('shows a server error in the footer', () => {
    renderWith(['What ships first?'], { error: 'You are already in a live session' });
    expect(screen.getByRole('alert')).toHaveTextContent('You are already in a live session');
  });

  it('sums the session up in the footer', async () => {
    const user = userEvent.setup();
    renderWith(['One', 'Two']);

    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('2 questions');
    expect(footer).toHaveTextContent('No timers');
    expect(footer).toHaveTextContent('No call');

    await user.click(
      within(screen.getByRole('group', { name: 'Discussion' })).getByRole('button', { name: '5m' }),
    );
    await user.click(
      within(screen.getByRole('group', { name: 'Voting' })).getByRole('button', { name: '2m' }),
    );
    // 2 × 5 min of discussion, plus 2 × 2 min of voting.
    expect(footer).toHaveTextContent('About 14 min');
  });
});

describe('SessionQuestionsForm timers and call', () => {
  it('sets a timer from its presets, and anything else through Custom', async () => {
    const user = userEvent.setup();
    const onSubmit = renderWith(['What ships first?']);
    const discussion = within(screen.getByRole('group', { name: 'Discussion' }));

    await user.click(discussion.getByRole('button', { name: '10m' }));
    expect(discussion.getByRole('button', { name: '10m' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(
      within(screen.getByRole('group', { name: 'Voting' })).getByRole('button', {
        name: 'Custom…',
      }),
    );
    const votingMinutes = screen.getByRole('spinbutton', { name: 'Voting timer minutes' });
    await user.clear(votingMinutes);
    await user.type(votingMinutes, '4');
    await user.tab();

    await user.click(open());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ discussionTimerSeconds: 600, votingTimerSeconds: 240 }),
      'open',
    );
    // A length that is none of the presets shows on the Custom chip.
    expect(
      within(screen.getByRole('group', { name: 'Voting' })).getByRole('button', { name: '4m' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a length that is no preset on the Custom chip, with the spinners shut', async () => {
    const user = userEvent.setup();
    renderWith(['What ships first?'], { initialDiscussionTimerSeconds: 8 * 60 });
    const discussion = within(screen.getByRole('group', { name: 'Discussion' }));

    const chip = discussion.getByRole('button', { name: '8m' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('spinbutton', { name: 'Discussion timer minutes' }),
    ).not.toBeInTheDocument();

    await user.click(chip);
    expect(screen.getByRole('spinbutton', { name: 'Discussion timer minutes' })).toHaveValue('08');
  });

  it('turns a timer back off', async () => {
    const user = userEvent.setup();
    const onSubmit = renderWith(['What ships first?'], { initialDiscussionTimerSeconds: 300 });

    await user.click(
      within(screen.getByRole('group', { name: 'Discussion' })).getByRole('button', {
        name: 'Off',
      }),
    );
    await user.click(open());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ discussionTimerSeconds: null }),
      'open',
    );
  });

  it('starts on No call, and sends a call once Live call is picked', async () => {
    const user = userEvent.setup();
    const onSubmit = renderWith(['What ships first?']);

    expect(screen.getByRole('radio', { name: /No call/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /Live call/ }));
    expect(screen.getByText('Everyone talks live while they work the board.')).toBeInTheDocument();

    await user.click(open());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ voiceEnabled: true }), 'open');
  });
});

describe('SessionQuestionsForm questions', () => {
  it('sends a question as brainstorm-only when it is set to Ideas (F41)', async () => {
    const user = userEvent.setup();
    const onSubmit = renderWith(['What ships first?', 'Any wild ideas?']);

    const second = within(screen.getByRole('radiogroup', { name: 'Question 2 ends with' }));
    expect(second.getByRole('radio', { name: 'Vote' })).toHaveAttribute('aria-checked', 'true');
    await user.click(second.getByRole('radio', { name: 'Brainstorm' }));
    expect(second.getByRole('radio', { name: 'Brainstorm' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await user.click(open());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        questions: [
          { text: 'What ships first?', votingEnabled: true },
          { text: 'Any wild ideas?', votingEnabled: false },
        ],
      }),
      'open',
    );
  });

  it('keeps each question’s vote choice with it when the rows are reordered', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({
      initialTitle: 'Roadmap',
      initialQuestions: [
        { text: 'Vote on this', votingEnabled: true },
        { text: 'Just ideas', votingEnabled: false },
      ],
    });

    await user.click(question(2));
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    await user.click(open());

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        questions: [
          { text: 'Just ideas', votingEnabled: false },
          { text: 'Vote on this', votingEnabled: true },
        ],
      }),
      'open',
    );
  });

  it('removes a question with its ×, but never the last one', async () => {
    const user = userEvent.setup();
    renderWith(['A', 'B']);

    await user.click(screen.getByRole('button', { name: 'Remove question 1' }));
    expect(questionTexts()).toEqual(['B']);
    expect(screen.getByRole('button', { name: 'Remove question 1' })).toBeDisabled();
  });

  // B9: the text used to stop at the limit with nothing to say why.
  it('counts the characters once a question nears the limit', async () => {
    const user = userEvent.setup();
    renderWith(['x'.repeat(115)]);

    expect(screen.queryByText(/\/150$/)).not.toBeInTheDocument();
    await user.type(question(1), 'yyyyy');
    expect(screen.getByText('120/150')).toBeInTheDocument();
  });

  it('does not surface a zod min-length message when the form is incomplete', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(title(), 'Roadmap');
    expect(screen.queryByText(/at least 1/i)).not.toBeInTheDocument();
    expect(open()).toBeDisabled();
  });
});

describe('SessionQuestionsForm keyboard flow', () => {
  // B2: Enter used to submit the whole form as soon as it could.
  it('goes from the title to the first question on Enter, without submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = renderWith(['What ships first?']);

    await user.click(title());
    await user.keyboard('{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(question(1)).toHaveFocus();
  });

  it('adds the next question on Enter and puts the caret in it', async () => {
    const user = userEvent.setup();
    const onSubmit = renderWith(['What ships first?']);

    await user.click(question(1));
    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(question(2)).toHaveFocus();

    await user.keyboard('Who owns it?{Enter}');
    expect(questionTexts()).toEqual(['What ships first?', 'Who owns it?', '']);
    // Enter in an empty last question adds no more.
    await user.keyboard('{Enter}');
    expect(questionTexts()).toHaveLength(3);
  });

  it('removes an empty question on Backspace and goes back to the one before', async () => {
    const user = userEvent.setup();
    renderWith(['First', '']);

    await user.click(question(2));
    await user.keyboard('{Backspace}');

    expect(questionTexts()).toEqual(['First']);
    expect(question(1)).toHaveFocus();
  });

  it('presses the primary button on Ctrl+Enter once the form is ready', async () => {
    const user = userEvent.setup();
    const onSubmit = renderWith(['What ships first?']);

    await user.click(question(1));
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ questions: [{ text: 'What ships first?', votingEnabled: true }] }),
      'open',
    );
  });

  // B3: rows were keyed by place, so focus stayed in the slot and a second
  // press moved the question that had just been displaced.
  it('moves a question with Alt+arrows and keeps the caret in it', async () => {
    const user = userEvent.setup();
    renderWith(['A', 'B', 'C']);

    await user.click(question(3));
    await user.keyboard('{Alt>}{ArrowUp}{ArrowUp}{/Alt}');

    expect(questionTexts()).toEqual(['C', 'A', 'B']);
    expect(question(1)).toHaveFocus();
  });

  it('turns a pasted list into one question per line', async () => {
    const user = userEvent.setup();
    renderWith([''], { initialTitle: '' });

    await user.click(question(1));
    await user.paste('- What went well?\n- What went badly?\n\n3. What do we change?');

    expect(questionTexts()).toEqual(['What went well?', 'What went badly?', 'What do we change?']);
    expect(question(3)).toHaveFocus();
  });
});

describe('SessionQuestionsForm reordering by drag', () => {
  it('drags a question by its handle into another one’s place', async () => {
    const onSubmit = renderWith(['A', 'B', 'C']);
    const rows = within(screen.getByRole('list', { name: 'Questions, in order' })).getAllByRole(
      'listitem',
    );
    // jsdom lays nothing out: give each row a place, 50px apart.
    rows.forEach((row, index) => {
      row.getBoundingClientRect = () => new DOMRect(0, index * 50, 400, 40);
    });
    const handle = screen.getByRole('button', { name: 'Move question 1' });

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 20 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 100 });
    // The numbers follow the order it would land in, while it is still held.
    expect(screen.getByRole('button', { name: 'Move question 3' })).toBe(handle);
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 100 });

    expect(questionTexts()).toEqual(['B', 'C', 'A']);
    fireEvent.click(open());
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          questions: ['B', 'C', 'A'].map((text) => ({ text, votingEnabled: true })),
        }),
        'open',
      ),
    );
  });

  it('treats a press on the handle that does not travel as no move', () => {
    renderWith(['A', 'B']);
    const handle = screen.getByRole('button', { name: 'Move question 1' });

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 20 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 22 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 22 });

    expect(questionTexts()).toEqual(['A', 'B']);
  });

  it('moves a question with the arrow keys from its handle', async () => {
    const user = userEvent.setup();
    renderWith(['A', 'B']);

    screen.getByRole('button', { name: 'Move question 1' }).focus();
    await user.keyboard('{ArrowDown}');

    expect(questionTexts()).toEqual(['B', 'A']);
    expect(screen.getByRole('button', { name: 'Move question 2' })).toHaveFocus();
  });
});

describe('SessionQuestionsForm limits and messages', () => {
  // B4: nothing used to say there was a limit until the server refused.
  it('stops adding questions at the limit and says so', () => {
    renderWith(Array.from({ length: SESSION_QUESTION_LIMIT }, (_, i) => `Q${i + 1}`));

    expect(screen.getByRole('button', { name: /Add question/ })).toBeDisabled();
    expect(
      screen.getByText(`That’s the most one session can hold (${SESSION_QUESTION_LIMIT}).`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${SESSION_QUESTION_LIMIT} of ${SESSION_QUESTION_LIMIT}`),
    ).toBeInTheDocument();
  });

  // B8: the message used to stay up until the next submit.
  it('clears a validation message once the form changes', async () => {
    const user = userEvent.setup();
    renderWith(['Fine', 'x'.repeat(200)]);

    await user.click(open());
    expect(screen.getByRole('alert')).toHaveTextContent('Question 2 is longer than 150 characters');

    await user.clear(question(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SessionQuestionsForm templates', () => {
  const sprint = findTemplate(BUILT_IN_TEMPLATES, 'sprint-planning')!;
  const retro = findTemplate(BUILT_IN_TEMPLATES, 'retrospective')!;

  it('starts filled in from the template it is given', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ initialTemplate: sprint });

    expect(title()).toHaveValue('Sprint planning');
    expect(screen.getByRole('radio', { name: /Live call/ })).toBeChecked();
    await user.click(open());

    expect(onSubmit).toHaveBeenCalledWith(
      {
        title: 'Sprint planning',
        questions: sprint.questions,
        discussionTimerSeconds: 600,
        votingTimerSeconds: 120,
        voiceEnabled: true,
      },
      'open',
    );
  });

  it('fills an untouched form from a card, with the starter title selected', async () => {
    const user = userEvent.setup();
    renderForm({ templates: BUILT_IN_TEMPLATES });

    await user.click(screen.getByRole('button', { name: 'Retrospective' }));

    expect(screen.getByRole('button', { name: 'Retrospective' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(questionTexts()).toEqual(retro.questions.map((q) => q.text));
    expect(title()).toHaveFocus();
    const input = title() as HTMLInputElement;
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Sprint retro'.length]);
    // Nothing the leader wrote was replaced, so there is nothing to undo.
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();

    // Typing replaces the starter title.
    await user.keyboard('Q4 retro');
    expect(title()).toHaveValue('Q4 retro');
  });

  // A2: over the leader's own work, a template applies at once, with Undo.
  it('offers Undo when a card replaces the leader’s work, and puts it back', async () => {
    const user = userEvent.setup();
    renderWith(['My own question'], { templates: BUILT_IN_TEMPLATES, initialTitle: '' });
    await user.type(title(), 'Mine');

    await user.click(screen.getByRole('button', { name: 'Brainstorming' }));
    expect(title()).toHaveValue('Brainstorm');
    expect(screen.getByText('Applied Brainstorming')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(title()).toHaveValue('Mine');
    expect(questionTexts()).toEqual(['My own question']);
    expect(screen.queryByText('Applied Brainstorming')).not.toBeInTheDocument();
  });

  it('shows no template cards where none are given', () => {
    renderWith(['A']);
    expect(screen.queryByRole('group', { name: 'Start from a template' })).not.toBeInTheDocument();
  });
});

// Review of 60a1c15: a paste used to lose the ends of long lines, and lines
// past the limit, without a word.
describe('SessionQuestionsForm pasting a long list', () => {
  it('says what did not fit, and keeps a long line whole for the leader to shorten', async () => {
    const user = userEvent.setup();
    renderWith(Array.from({ length: SESSION_QUESTION_LIMIT - 1 }, (_, i) => `Q${i + 1}`));
    const long = 'z'.repeat(160);

    await user.click(
      screen.getByRole('textbox', { name: `Question ${SESSION_QUESTION_LIMIT - 1}` }),
    );
    await user.paste(`${long}\nOne more\nAnd another`);

    expect(questionTexts()).toHaveLength(SESSION_QUESTION_LIMIT);
    expect(questionTexts().at(-1)).toBe(long);
    expect(screen.getByText('160/150')).toBeInTheDocument();
    expect(
      screen.getByText(
        `Added 1 question. 2 more didn’t fit: a session holds up to ${SESSION_QUESTION_LIMIT}. 1 is over 150 characters: shorten it before sending.`,
      ),
    ).toHaveAttribute('role', 'status');
  });

  it('says nothing more for a paste that simply worked', () => {
    expect(pasteNoticeText(3, 0, 0)).toBeNull();
    expect(pasteNoticeText(2, 0, 2)).toBe(
      'Added 2 questions. 2 are over 150 characters: shorten them before sending.',
    );
  });
});

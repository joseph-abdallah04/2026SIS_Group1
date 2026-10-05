import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SessionQuestionsForm } from './SessionQuestionsForm';

function renderForm(onSubmit = vi.fn()) {
  return render(
    <SessionQuestionsForm
      submitLabel="Create session"
      submittingLabel="Creating…"
      submitting={false}
      error={null}
      onSubmit={onSubmit}
    />,
  );
}

describe('SessionQuestionsForm', () => {
  it('keeps Create session disabled until a title and at least one question are filled', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    const submit = screen.getByRole('button', { name: 'Create session' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/focus \/ title/i), 'Roadmap');
    expect(submit).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Question 1'), 'What ships first?');
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Roadmap',
      questions: [{ text: 'What ships first?', votingEnabled: true }],
      discussionTimerSeconds: null,
      votingTimerSeconds: null,
    });
  });

  it('includes optional timer durations when they are set', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    await user.type(screen.getByLabelText(/focus \/ title/i), 'Roadmap');
    await user.type(screen.getByPlaceholderText('Question 1'), 'What ships first?');
    const discussionMinutes = screen.getByRole('spinbutton', { name: 'Discussion timer minutes' });
    await user.clear(discussionMinutes);
    await user.type(discussionMinutes, '10');
    const discussionSeconds = screen.getByRole('spinbutton', { name: 'Discussion timer seconds' });
    await user.clear(discussionSeconds);
    await user.type(discussionSeconds, '15');
    const votingMinutes = screen.getByRole('spinbutton', { name: 'Voting timer minutes' });
    await user.clear(votingMinutes);
    await user.type(votingMinutes, '2');
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Roadmap',
      questions: [{ text: 'What ships first?', votingEnabled: true }],
      discussionTimerSeconds: 615,
      votingTimerSeconds: 120,
    });
  });

  it('sends a question as brainstorm-only when its Vote is turned off (F41)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    await user.type(screen.getByLabelText(/focus \/ title/i), 'Roadmap');
    await user.type(screen.getByPlaceholderText('Question 1'), 'What ships first?');
    await user.click(screen.getByRole('button', { name: '+ Add question' }));
    await user.type(screen.getByPlaceholderText('Question 2'), 'Any wild ideas?');

    const vote2 = screen.getByRole('button', { name: 'Vote on question 2' });
    expect(vote2).toHaveAttribute('aria-pressed', 'true');
    await user.click(vote2);
    expect(vote2).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Create session' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        questions: [
          { text: 'What ships first?', votingEnabled: true },
          { text: 'Any wild ideas?', votingEnabled: false },
        ],
      }),
    );
  });

  it('keeps each question’s vote choice with it when the rows are reordered', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SessionQuestionsForm
        initialTitle="Roadmap"
        initialQuestions={[
          { text: 'Vote on this', votingEnabled: true },
          { text: 'Just ideas', votingEnabled: false },
        ]}
        submitLabel="Save changes"
        submittingLabel="Saving…"
        submitting={false}
        error={null}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('button', { name: 'Vote on question 2' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.click(screen.getAllByRole('button', { name: 'Move question up' })[1]!);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        questions: [
          { text: 'Just ideas', votingEnabled: false },
          { text: 'Vote on this', votingEnabled: true },
        ],
      }),
    );
  });

  it('does not surface a zod min-length message when the form is incomplete', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/focus \/ title/i), 'Roadmap');
    expect(screen.queryByText(/at least 1/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create session' })).toBeDisabled();
  });
});

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
      questions: ['What ships first?'],
    });
  });

  it('does not surface a zod min-length message when the form is incomplete', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/focus \/ title/i), 'Roadmap');
    expect(screen.queryByText(/at least 1/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create session' })).toBeDisabled();
  });
});

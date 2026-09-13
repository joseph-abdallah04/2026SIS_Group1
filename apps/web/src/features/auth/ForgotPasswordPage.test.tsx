import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as authApi from './api';
import { ForgotPasswordPage } from './ForgotPasswordPage';

vi.mock('./api', () => ({ forgotPassword: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.mocked(authApi.forgotPassword).mockReset();
  });

  it('renders the email field', () => {
    renderPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('shows the same confirmation whether or not the account exists', async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(authApi.forgotPassword).toHaveBeenCalledWith({ email: 'alice@example.com' });
  });

  // The endpoint's own response is identical on success or failure (rate
  // limit, transient error, unknown email) — the UI must not distinguish
  // them either, or it becomes the enumeration leak the backend avoided.
  it('shows the same confirmation even if the request fails', async () => {
    vi.mocked(authApi.forgotPassword).mockRejectedValue(new Error('network error'));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
  });
});

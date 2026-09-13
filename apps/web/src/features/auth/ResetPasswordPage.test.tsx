import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../../lib/api';
import * as authApi from './api';
import { ResetPasswordPage } from './ResetPasswordPage';

vi.mock('./api', () => ({ resetPassword: vi.fn() }));

function renderPage(path = '/reset-password?token=test-token') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ResetPasswordPage />
    </MemoryRouter>,
  );
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.mocked(authApi.resetPassword).mockReset();
  });

  it('shows an error and no form when the URL has no token', () => {
    renderPage('/reset-password');
    expect(screen.getByRole('alert')).toHaveTextContent(/missing its token/i);
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  });

  it('rejects mismatched passwords without hitting the network', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/^new password$/i), 'longenough');
    await user.type(screen.getByLabelText(/confirm new password/i), 'somethingelse');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it('shows a success screen on a valid submit', async () => {
    vi.mocked(authApi.resetPassword).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/^new password$/i), 'longenough');
    await user.type(screen.getByLabelText(/confirm new password/i), 'longenough');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
    expect(authApi.resetPassword).toHaveBeenCalledWith({
      token: 'test-token',
      password: 'longenough',
    });
  });

  it('shows a clear error for an expired or already-used token', async () => {
    vi.mocked(authApi.resetPassword).mockRejectedValue(
      new ApiClientError(401, 'This password reset link has expired', 'TOKEN_EXPIRED'),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/^new password$/i), 'longenough');
    await user.type(screen.getByLabelText(/confirm new password/i), 'longenough');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i);
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });
});

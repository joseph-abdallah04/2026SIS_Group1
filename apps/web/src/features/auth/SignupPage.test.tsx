import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as authApi from './api';
import { SignupPage } from './SignupPage';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('./api', () => ({ signup: vi.fn() }));
vi.mock('../../lib/socket', () => ({ disconnectSocket: vi.fn(), getSocket: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
  );
}

describe('SignupPage', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    vi.mocked(authApi.signup).mockReset();
    localStorage.clear();
  });

  it('renders the signup form fields', () => {
    renderPage();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it('shows a validation error without hitting the network for an invalid email', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/display name/i), 'Alice');
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^password$/i), 'longenough');
    await user.type(screen.getByLabelText(/confirm password/i), 'longenough');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(authApi.signup).not.toHaveBeenCalled();
  });

  it('shows a validation error without hitting the network when passwords do not match', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/display name/i), 'Alice');
    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'longenough');
    await user.type(screen.getByLabelText(/confirm password/i), 'somethingelse');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(authApi.signup).not.toHaveBeenCalled();
  });

  it('shows a check-your-email confirmation on success, without logging in', async () => {
    vi.mocked(authApi.signup).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/display name/i), 'Alice');
    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'longenough');
    await user.type(screen.getByLabelText(/confirm password/i), 'longenough');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    // No session token is issued by signup — the account is unverified until
    // the emailed link is clicked, so nothing should navigate or log in.
    expect(navigateMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('rt_token')).toBeNull();
  });
});

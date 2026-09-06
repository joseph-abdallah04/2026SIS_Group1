import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../../lib/api';
import * as authApi from './api';
import { LoginPage } from './LoginPage';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('./api', () => ({ login: vi.fn() }));
vi.mock('../../lib/socket', () => ({ disconnectSocket: vi.fn(), getSocket: vi.fn() }));

function renderPage(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    vi.mocked(authApi.login).mockReset();
    localStorage.clear();
  });

  it('renders the login form fields', () => {
    renderPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('shows the generic error and does not navigate on invalid credentials', async () => {
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiClientError(401, 'Incorrect email or password', 'INVALID_CREDENTIALS'),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('stores the token and navigates to /dashboard on success', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      token: 'test-token',
      user: {
        id: 'u1',
        email: 'alice@example.com',
        displayName: 'Alice',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true }));
    expect(localStorage.getItem('rt_token')).toBe('test-token');
  });

  it('returns to the join link after login when next is a same-origin path', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      token: 'test-token',
      user: {
        id: 'u1',
        email: 'bob@example.com',
        displayName: 'Bob',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const user = userEvent.setup();
    renderPage('/login?next=/join/K7NP-3WQZ');

    await user.type(screen.getByLabelText(/email/i), 'bob@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/join/K7NP-3WQZ', { replace: true }),
    );
  });
});

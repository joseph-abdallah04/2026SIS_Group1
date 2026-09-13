import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../../lib/api';
import * as authApi from '../auth/api';
import { ProfilePage } from './ProfilePage';

const navigateMock = vi.fn();
const clearTokenMock = vi.fn();
const disconnectSocketMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../auth/api', () => ({
  getMe: vi.fn(),
  updateProfile: vi.fn(),
  deleteAccount: vi.fn(),
}));
vi.mock('../../lib/auth', async () => {
  const actual = await vi.importActual<typeof import('../../lib/auth')>('../../lib/auth');
  return { ...actual, clearToken: () => clearTokenMock() };
});
vi.mock('../../lib/socket', () => ({ disconnectSocket: () => disconnectSocketMock() }));

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );
}

const USER = {
  id: 'u1',
  email: 'alice@example.com',
  displayName: 'Alice',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.mocked(authApi.getMe).mockReset();
    vi.mocked(authApi.updateProfile).mockReset();
    vi.mocked(authApi.deleteAccount).mockReset();
    navigateMock.mockClear();
    clearTokenMock.mockClear();
    disconnectSocketMock.mockClear();
  });

  it('renders the fetched email and display name', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue({ user: USER });
    renderPage();

    expect(await screen.findByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Alice');
  });

  it('shows an inline error and does not call the API for an empty name', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue({ user: USER });
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText(/display name/i);
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(authApi.updateProfile).not.toHaveBeenCalled();
  });

  it('updates the name optimistically and rolls back on server failure', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue({ user: USER });
    vi.mocked(authApi.updateProfile).mockRejectedValue(
      new ApiClientError(400, 'Invalid input', 'INVALID_INPUT'),
    );
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText(/display name/i);
    await user.clear(input);
    await user.type(input, 'Bob');
    await user.click(screen.getByRole('button', { name: /save/i }));

    // Rolls back to the last server-confirmed value once the save fails.
    await waitFor(() => expect(input).toHaveValue('Alice'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('disables Save and ignores a second submit while one is already in flight', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue({ user: USER });
    let resolveUpdate: (value: typeof USER) => void = () => {};
    vi.mocked(authApi.updateProfile).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText(/display name/i);
    await user.clear(input);
    // Enter submits the form directly, bypassing the Save button's own
    // `disabled` attribute — this is the actual race a double-submit could
    // come from, not just a second click on a disabled button.
    await user.type(input, 'Bob{Enter}{Enter}');

    await waitFor(() => expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled());
    expect(authApi.updateProfile).toHaveBeenCalledTimes(1);

    resolveUpdate({ ...USER, displayName: 'Bob' });
    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });

  it('saves successfully and shows a confirmation', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue({ user: USER });
    vi.mocked(authApi.updateProfile).mockResolvedValue({ ...USER, displayName: 'Bob' });
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText(/display name/i);
    await user.clear(input);
    await user.type(input, 'Bob');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument());
    expect(input).toHaveValue('Bob');
  });

  describe('delete account', () => {
    it('keeps the delete button disabled until a password is entered', async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({ user: USER });
      const user = userEvent.setup();
      renderPage();

      await screen.findByText('alice@example.com');
      const deleteButton = screen.getByRole('button', { name: /delete account/i });
      expect(deleteButton).toBeDisabled();

      await user.type(screen.getByLabelText(/confirm your password/i), 'hunter2');
      expect(deleteButton).not.toBeDisabled();
    });

    it('requires a second, explicit confirmation before calling the API', async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({ user: USER });
      const user = userEvent.setup();
      renderPage();

      await screen.findByText('alice@example.com');
      await user.type(screen.getByLabelText(/confirm your password/i), 'hunter2');
      await user.click(screen.getByRole('button', { name: /delete account/i }));

      expect(authApi.deleteAccount).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('deletes the account, clears the session, and redirects to /login on confirm', async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({ user: USER });
      vi.mocked(authApi.deleteAccount).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      renderPage();

      await screen.findByText('alice@example.com');
      await user.type(screen.getByLabelText(/confirm your password/i), 'hunter2');
      await user.click(screen.getByRole('button', { name: /delete account/i }));
      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete account/i }));

      await waitFor(() =>
        expect(authApi.deleteAccount).toHaveBeenCalledWith({ password: 'hunter2' }),
      );
      expect(clearTokenMock).toHaveBeenCalled();
      expect(disconnectSocketMock).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    });

    it('shows the server error and does not clear the session on a wrong password', async () => {
      vi.mocked(authApi.getMe).mockResolvedValue({ user: USER });
      vi.mocked(authApi.deleteAccount).mockRejectedValue(
        new ApiClientError(401, 'Incorrect password', 'INVALID_PASSWORD'),
      );
      const user = userEvent.setup();
      renderPage();

      await screen.findByText('alice@example.com');
      await user.type(screen.getByLabelText(/confirm your password/i), 'wrongpass');
      await user.click(screen.getByRole('button', { name: /delete account/i }));
      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete account/i }));

      expect(await screen.findByText('Incorrect password')).toBeInTheDocument();
      expect(clearTokenMock).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });
});

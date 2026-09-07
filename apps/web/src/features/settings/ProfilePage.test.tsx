import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../../lib/api';
import * as authApi from '../auth/api';
import { ProfilePage } from './ProfilePage';

vi.mock('../auth/api', () => ({ getMe: vi.fn(), updateProfile: vi.fn() }));

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
});

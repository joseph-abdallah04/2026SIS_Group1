import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateSessionPage } from './CreateSessionPage';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('./useCreateSession', () => ({
  useCreateSession: () => ({ create: vi.fn(), submitting: false, error: null }),
}));

describe('CreateSessionPage', () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it('asks before abandoning an unsaved session for the dashboard', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CreateSessionPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(screen.getByRole('dialog', { name: 'Discard this session?' })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });

  it('Cancel on the form opens the same discard dialog', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CreateSessionPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Discard this session?' })).toBeInTheDocument();
  });
});

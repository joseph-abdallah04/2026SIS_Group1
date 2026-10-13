import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateSessionPage } from './CreateSessionPage';

const navigateMock = vi.fn();
const createMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('./useCreateSession', () => ({
  useCreateSession: () => ({ create: createMock, submitting: false, error: null }),
}));

describe('CreateSessionPage', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    createMock.mockReset();
  });

  /** Fill in the two required fields so the form can submit. */
  async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Focus / title'), 'Roadmap');
    await user.type(screen.getByPlaceholderText('Question 1'), 'What ships first?');
  }

  it('starts on No call, and creates a session with no call if left alone', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CreateSessionPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('radio', { name: /No call/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Live call/ })).not.toBeChecked();

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ voiceEnabled: false }));
  });

  it('creates a session with a call when the leader picks Live call', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CreateSessionPage />
      </MemoryRouter>,
    );

    await fillRequired(user);
    await user.click(screen.getByRole('radio', { name: /Live call/ }));
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ voiceEnabled: true }));
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

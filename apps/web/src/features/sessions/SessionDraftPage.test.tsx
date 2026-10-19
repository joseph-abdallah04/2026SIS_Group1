import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionDetail } from './useSessionDetail';

const navigateMock = vi.fn();
const post = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../../lib/api', () => ({
  api: { post: (...args: unknown[]) => post(...args) },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
let userId = 'leader-1';
vi.mock('../../lib/currentUser', () => ({
  useCurrentUserId: () => userId,
  getCurrentUserId: () => userId,
}));

const { ApiClientError } = await import('../../lib/api');
const { SessionDraftPage } = await import('./SessionDraftPage');

const draft = {
  id: 's1',
  title: 'Roadmap',
  status: 'draft',
  leaderId: 'leader-1',
  discussionTimerSeconds: 300,
  votingTimerSeconds: 120,
  voiceEnabled: true,
  questions: [
    { id: 'q1', text: 'What ships first?', votingEnabled: true },
    { id: 'q2', text: 'Any wild ideas?', votingEnabled: false },
  ],
} as unknown as SessionDetail;

function renderPage(onOpened = vi.fn(), state?: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/sessions/s1', state }]}>
      <SessionDraftPage session={draft} onOpened={onOpened} />
    </MemoryRouter>,
  );
  return onOpened;
}

describe('SessionDraftPage', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    post.mockReset();
    userId = 'leader-1';
  });

  it('shows the draft as the lobby will: its facts and the questions ahead', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Roadmap' })).toBeInTheDocument();
    // 2 × 5 min of discussion, plus one 2-minute vote.
    expect(screen.getByText('About 12 min')).toBeInTheDocument();
    expect(screen.getByText('Live call')).toBeInTheDocument();
    expect(screen.getByText('What ships first?')).toBeInTheDocument();
    expect(screen.getByText('Brainstorm')).toBeInTheDocument();
  });

  it('opens the room and hands on to the waiting room', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ id: 's1', code: 'K7NP-3WQZ' });
    const onOpened = renderPage();

    await user.click(screen.getByRole('button', { name: 'Open the room' }));

    expect(post).toHaveBeenCalledWith('/api/sessions/s1/open', {});
    // No motion in the suite, so the moment hands straight on.
    await vi.waitFor(() => expect(onOpened).toHaveBeenCalled());
  });

  it('says why when the room will not open, and offers it again', async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(new ApiClientError(409, 'You are already in a live session'));
    const onOpened = renderPage();

    await user.click(screen.getByRole('button', { name: 'Open the room' }));

    expect(screen.getByRole('alert')).toHaveTextContent('You are already in a live session');
    expect(screen.getByRole('button', { name: 'Open the room' })).toBeEnabled();
    expect(onOpened).not.toHaveBeenCalled();
  });

  // B7: fixing a typo after Create meant Dashboard, then ⋯, then Edit.
  it('lets the leader go straight back to editing', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(navigateMock).toHaveBeenCalledWith('/sessions/s1/edit');
  });

  // "Open the room" made the draft but could not open it: say why, and offer it again.
  it('shows why the room did not open when it arrives from the create page', () => {
    renderPage(vi.fn(), { openError: 'You are already in a live session' });

    expect(screen.getByRole('alert')).toHaveTextContent('You are already in a live session');
    expect(screen.getByRole('button', { name: 'Open the room' })).toBeEnabled();
    // Said once: cleared from history, so a reload or Back does not say it again.
    expect(navigateMock).toHaveBeenCalledWith('/sessions/s1', { replace: true, state: null });
  });

  it('offers no Open or Edit to anyone else, only the way back', async () => {
    const user = userEvent.setup();
    userId = 'someone-else';
    renderPage();

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open the room' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Only the session leader can open this for joining.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });
});

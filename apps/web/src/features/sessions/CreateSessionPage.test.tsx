import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateSessionPage } from './CreateSessionPage';
import { readSetup, setupAutosaveKey, writeSetup } from './setup/setupAutosave';
import { initialSetupState } from './setup/useSessionSetupForm';

const navigateMock = vi.fn();
const createMock = vi.fn();
const createAndOpenMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../lib/currentUser', () => ({
  useCurrentUserId: () => 'u1',
  getCurrentUserId: () => 'u1',
}));

const KEY = setupAutosaveKey('u1')!;

vi.mock('./useCreateSession', () => ({
  useCreateSession: () => ({
    create: createMock,
    createAndOpen: createAndOpenMock,
    submitting: false,
    error: null,
  }),
}));

function renderPage(path = '/sessions/new') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <CreateSessionPage />
    </MemoryRouter>,
  );
}

describe('CreateSessionPage', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    createMock.mockReset();
    createAndOpenMock.mockReset();
  });

  /** Fill in the two required fields so the form can submit. */
  async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Session title'), 'Roadmap');
    await user.type(screen.getByRole('textbox', { name: 'Question 1' }), 'What ships first?');
  }

  // F2: one click from the form to the waiting room.
  it('opens the room in one go and goes to it', async () => {
    const user = userEvent.setup();
    createAndOpenMock.mockResolvedValue({ sessionId: 's9', opened: true, code: 'K7NP-3WQZ' });
    renderPage();

    expect(screen.getByRole('radio', { name: /No call/ })).toBeChecked();
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: /Open the room/ }));

    expect(createAndOpenMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Roadmap', voiceEnabled: false }),
    );
    expect(createMock).not.toHaveBeenCalled();
    // No motion in the suite, so the room-set moment hands straight on.
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/sessions/s9', {
        replace: true,
        state: undefined,
      }),
    );
    // Nothing left to pick up: it is a room now.
    expect(readSetup(KEY)).toBeNull();
  });

  it('lands on the draft page, saying why, when the room was made but would not open', async () => {
    const user = userEvent.setup();
    createAndOpenMock.mockResolvedValue({
      sessionId: 's9',
      opened: false,
      openError: 'You are already in a live session',
    });
    renderPage();

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: /Open the room/ }));

    expect(navigateMock).toHaveBeenCalledWith('/sessions/s9', {
      replace: true,
      state: { openError: 'You are already in a live session' },
    });
  });

  it('saves a draft for later, with a call when Live call is picked', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({ id: 's7' });
    renderPage();

    await fillRequired(user);
    await user.click(screen.getByRole('radio', { name: /Live call/ }));
    await user.click(screen.getByRole('button', { name: 'Save as draft' }));

    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ voiceEnabled: true }));
    expect(navigateMock).toHaveBeenCalledWith('/sessions/s7', { replace: true });
  });

  it('asks before abandoning an unsaved session for the dashboard', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Session title'), 'Roadmap');
    await user.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(screen.getByRole('dialog', { name: 'Discard this session?' })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });

  it('Cancel opens the same discard dialog', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('textbox', { name: 'Question 1' }), 'What ships first?');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Discard this session?' })).toBeInTheDocument();
  });

  // B5: an empty form has nothing to lose, so there is nothing to ask.
  it('goes straight back from an empty form', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });

  // B5: refresh or close used to throw a filled form away without a word.
  it('warns before the page is closed once something has been written', async () => {
    const user = userEvent.setup();
    renderPage();

    const untouched = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(untouched);
    expect(untouched.defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText('Session title'), 'Roadmap');
    const filled = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(filled);
    expect(filled.defaultPrevented).toBe(true);
  });

  it('offers the four templates as cards', () => {
    renderPage();
    for (const name of ['Blank', 'Sprint planning', 'Retrospective', 'Brainstorming']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('opens filled in from ?template=', async () => {
    const user = userEvent.setup();
    renderPage('/sessions/new?template=retrospective');

    expect(screen.getByLabelText('Session title')).toHaveValue('Sprint retro');
    expect(screen.getByRole('button', { name: 'Retrospective' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Question 4' })).toHaveValue(
      'Which one action do we commit to?',
    );
    // A template's own content is nothing to lose.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });

  // Pick up where you left off: what was being written is kept in this browser.
  // Code review: once a room is made, this form must not send again while the
  // room-set moment plays over it.
  it('stays busy once the room has been opened', async () => {
    const user = userEvent.setup();
    createAndOpenMock.mockResolvedValue({ sessionId: 's9', opened: true, code: 'K7NP-3WQZ' });
    renderPage();

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: /Open the room/ }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: 'Opening…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save as draft' })).toBeDisabled();
    expect(createAndOpenMock).toHaveBeenCalledTimes(1);
  });

  // Review of 60a1c15: a save timer set by the last keystroke fired after
  // "Open the room" had cleared the kept copy (the form stays up during the
  // room-set moment), so the next New session offered back a session that
  // already existed, and picking it up would have made a duplicate.
  it('keeps nothing once the room is opened, even straight after typing', async () => {
    const user = userEvent.setup();
    createAndOpenMock.mockResolvedValue({ sessionId: 's9', opened: true, code: 'K7NP-3WQZ' });
    renderPage();

    await user.type(screen.getByLabelText('Session title'), 'Roadmap');
    await user.type(screen.getByRole('textbox', { name: 'Question 1' }), 'Q?');
    // Inside the 400 ms the last keystroke's save waits.
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(readSetup(KEY)).toBeNull();
  });

  it('keeps the form while it is written', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Session title'), 'Roadmap');
    await waitFor(() => expect(readSetup(KEY)?.state.title).toBe('Roadmap'));
  });

  it('offers a kept form back, and picks it up', async () => {
    const user = userEvent.setup();
    const kept = initialSetupState(
      { title: 'Q4 planning', questions: [{ text: 'What ships first?', votingEnabled: false }] },
      () => 'old-1',
    );
    writeSetup(KEY, { ...kept, edited: true }, Date.now() - 12 * 60_000);
    renderPage();

    const offer = screen.getByRole('region', { name: 'Pick up where you left off' });
    expect(offer).toHaveTextContent('You were setting up “Q4 planning” 12 min ago.');
    await user.click(screen.getByRole('button', { name: 'Pick up where you left off' }));

    expect(
      screen.queryByRole('region', { name: 'Pick up where you left off' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Session title')).toHaveValue('Q4 planning');
    expect(screen.getByRole('textbox', { name: 'Question 1' })).toHaveValue('What ships first?');
    // It is their own work again: leaving asks first.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Discard this session?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    // Past the wait of any save the last change set off: it must not put the
    // copy back (the page stays up here, as navigation is mocked).
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(readSetup(KEY)).toBeNull();
  });

  it('starts fresh, letting the kept form go', async () => {
    const user = userEvent.setup();
    writeSetup(
      KEY,
      initialSetupState({ title: 'Old' }, () => 'old-1'),
    );
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Start fresh' }));
    expect(screen.getByLabelText('Session title')).toHaveValue('');
    expect(readSetup(KEY)).toBeNull();
  });
});

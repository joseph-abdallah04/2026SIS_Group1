import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SidePanelControl } from '../sidepanel';

const get = vi.fn();
vi.mock('../../lib/api', () => ({
  api: { get: (...args: unknown[]) => get(...args), post: vi.fn() },
  ApiClientError: class ApiClientError extends Error {},
}));

// The router's listeners only subscribe; nothing here broadcasts.
vi.mock('../../lib/socket', () => ({
  getSocket: () => ({ on: vi.fn(), off: vi.fn() }),
  disconnectSocket: vi.fn(),
}));

vi.mock('../../lib/currentUser', () => ({
  useCurrentUserId: () => 'leader-1',
  getCurrentUserId: () => 'leader-1',
}));

// Both live views as stand-ins: what matters is when each is on screen, and
// what the router hands them.
let lobbyPanel: SidePanelControl | null = null;
let boardPanel: SidePanelControl | null = null;

vi.mock('./WaitingRoom', () => ({
  WaitingRoom: ({
    onLeftLobby,
    sidePanel,
  }: {
    onLeftLobby: () => void;
    sidePanel: SidePanelControl;
  }) => {
    lobbyPanel = sidePanel;
    return (
      <div>
        <p>Lobby</p>
        <button type="button" onClick={() => sidePanel.open('people')}>
          Open People
        </button>
        <button type="button" onClick={onLeftLobby}>
          Started
        </button>
      </div>
    );
  },
}));

vi.mock('./SessionEndedPage', async () => {
  const { useSearchParams } = await import('react-router-dom');
  return {
    SessionEndedPage: ({ justEnded }: { justEnded?: boolean }) => {
      const [, setParams] = useSearchParams();
      return (
        <div>
          <p>{justEnded ? 'Summary, just ended' : 'Summary'}</p>
          <button type="button" onClick={() => setParams({ view: 'boards' })}>
            To the boards
          </button>
        </div>
      );
    },
  };
});

vi.mock('./SessionArchive', async () => {
  const { useSearchParams } = await import('react-router-dom');
  return {
    SessionArchive: () => {
      const [, setParams] = useSearchParams();
      return (
        <button type="button" onClick={() => setParams({})}>
          Back to summary
        </button>
      );
    },
  };
});

vi.mock('../pinboard/SessionPinboard', () => ({
  SessionPinboard: ({ sidePanel }: { sidePanel: SidePanelControl }) => {
    boardPanel = sidePanel;
    return <p>Board</p>;
  },
}));

const { SessionRouter } = await import('./SessionRouter');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function session(status: 'lobby' | 'active' | 'ended') {
  return {
    id: 's1',
    code: 'ABCD-EFGH',
    title: 'Roadmap',
    leaderId: 'leader-1',
    status,
    createdAt: '2026-10-19T00:00:00.000Z',
    startedAt: status === 'active' ? '2026-10-19T00:05:00.000Z' : null,
    endedAt: null,
    discussionTimerSeconds: null,
    votingTimerSeconds: null,
    voiceEnabled: false,
    questions: [],
  };
}

function renderRouter(path = '/sessions/s1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sessions/:id" element={<SessionRouter />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  get.mockReset();
  lobbyPanel = null;
  boardPanel = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SessionRouter: lobby → board', () => {
  it('swaps the lobby for the board in one step, with no "Loading session…" between', async () => {
    const user = userEvent.setup();
    const pushState = vi.spyOn(window.history, 'pushState');
    get.mockResolvedValueOnce(session('lobby'));
    renderRouter();
    expect(await screen.findByText('Lobby')).toBeInTheDocument();
    // The guard pushes once from an effect; count from after it, which under
    // load can land a moment after the lobby is on screen.
    await waitFor(() => expect(pushState).toHaveBeenCalled());
    const guardPushes = pushState.mock.calls.length;

    const started = deferred<ReturnType<typeof session>>();
    get.mockReturnValueOnce(started.promise);
    await user.click(screen.getByRole('button', { name: 'Started' }));

    // The lobby holds the screen while the new copy is on its way.
    expect(screen.getByText('Lobby')).toBeInTheDocument();
    expect(screen.queryByText('Loading session…')).toBeNull();

    await act(async () => started.resolve(session('active')));
    expect(screen.getByText('Board')).toBeInTheDocument();
    expect(screen.queryByText('Lobby')).toBeNull();
    // The back-button guard stayed mounted across the swap: no second entry.
    expect(pushState.mock.calls.length).toBe(guardPushes);
  });

  it('keeps the side panel’s open feature through Start', async () => {
    const user = userEvent.setup();
    get.mockResolvedValueOnce(session('lobby'));
    renderRouter();
    await screen.findByText('Lobby');

    await user.click(screen.getByRole('button', { name: 'Open People' }));
    expect(lobbyPanel?.tab).toBe('people');

    get.mockResolvedValueOnce(session('active'));
    await user.click(screen.getByRole('button', { name: 'Started' }));
    await screen.findByText('Board');
    expect(boardPanel?.tab).toBe('people');
  });
});

describe('SessionRouter: the meeting ends', () => {
  it('tells the summary it has just ended when this page had it live', async () => {
    const user = userEvent.setup();
    get.mockResolvedValueOnce(session('lobby'));
    renderRouter();
    await screen.findByText('Lobby');

    // The lobby's `onLeftLobby` refreshes; here the session comes back ended.
    get.mockResolvedValueOnce(session('ended'));
    await user.click(screen.getByRole('button', { name: 'Started' }));

    expect(await screen.findByText('Summary, just ended')).toBeInTheDocument();
  });

  it('does not, for a session that was already over when it was opened', async () => {
    get.mockResolvedValueOnce(session('ended'));
    renderRouter();

    expect(await screen.findByText('Summary')).toBeInTheDocument();
    expect(screen.queryByText('Summary, just ended')).toBeNull();
  });

  it('marks the moment once: back from the boards is not arriving again', async () => {
    const user = userEvent.setup();
    get.mockResolvedValueOnce(session('lobby'));
    renderRouter();
    await screen.findByText('Lobby');
    get.mockResolvedValueOnce(session('ended'));
    await user.click(screen.getByRole('button', { name: 'Started' }));
    await screen.findByText('Summary, just ended');

    await user.click(screen.getByRole('button', { name: 'To the boards' }));
    await user.click(await screen.findByRole('button', { name: 'Back to summary' }));

    expect(await screen.findByText('Summary')).toBeInTheDocument();
    expect(screen.queryByText('Summary, just ended')).toBeNull();
  });
});

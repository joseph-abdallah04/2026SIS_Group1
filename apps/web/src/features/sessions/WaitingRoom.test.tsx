import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NOTICE_AUTO_HIDE_MS } from '../voice/VoiceNotice';
import type { SessionDetail } from './useSessionDetail';

const start = vi.fn();

/**
 * The voice room, as this lobby sees it. Mutable so a test can say "nobody has
 * reached voice yet" or "this server has none" without re-mocking the module.
 */
let voice = freshVoice();

function freshVoice(overrides: Record<string, unknown> = {}) {
  return {
    status: 'connected',
    micStatus: 'live',
    micEnabled: true,
    micBusy: false,
    micPermissionDenied: false,
    participants: [] as {
      identity: string;
      name: string;
      isLocal: boolean;
      isSpeaking: boolean;
      isMuted: boolean;
    }[],
    error: null,
    audioBlocked: false,
    retry: vi.fn(),
    requestMicrophone: vi.fn(),
    toggleMic: vi.fn(),
    unlockAudio: vi.fn(),
    ...overrides,
  };
}

/** Kept as a spy so a test can check whether the lobby asked to join at all. */
const useVoiceRoom = vi.fn<(sessionId: string, enabled?: boolean) => typeof voice>(() => voice);

// Only the hook is replaced: `MicToggle`, `VoiceNotice` and the seat helpers
// are the real ones, because how they render off this state is the thing worth
// asserting. Left unmocked, the hook would reach for a real token here.
vi.mock('../voice', async () => {
  const actual = await vi.importActual<typeof import('../voice')>('../voice');
  return { ...actual, useVoiceRoom };
});

/** The room as the lobby's hook reports it. Mutable per test. */
const EVERYONE = [
  { id: 'leader-1', displayName: 'Joey' },
  { id: 'u2', displayName: 'Alice Smith' },
];
let participants: { id: string; displayName: string }[] | null = EVERYONE;
let isLive = true;
let joinFailed = false;
const retryJoin = vi.fn();
/** Whose screen this is. */
let currentUser = 'leader-1';

/** What the page hands the hook for "the lobby is over", so a test can call it. */
let leaveLobby: ((why: 'started' | 'moved-on') => void) | undefined;

vi.mock('./useWaitingRoom', () => ({
  useWaitingRoom: (_sessionId: string, onLeftLobby?: (why: 'started' | 'moved-on') => void) => {
    leaveLobby = onLeftLobby;
    return lobbyState();
  },
}));

function lobbyState() {
  return {
    participants,
    memberNames: new Map([
      ['leader-1', 'Joey'],
      ['u2', 'Alice Smith'],
    ]),
    viewerId: currentUser,
    loading: participants === null,
    isLive,
    joinFailed,
    retryJoin,
  };
}

/** The arrival notices listen on the socket; this one only stores listeners. */
type Listener = (payload: unknown) => void;
const socketListeners = new Map<string, Set<Listener>>();
vi.mock('../../lib/socket', () => ({
  getSocket: () => ({
    on: (event: string, cb: Listener) => {
      const set = socketListeners.get(event) ?? new Set<Listener>();
      set.add(cb);
      socketListeners.set(event, set);
    },
    off: (event: string, cb: Listener) => socketListeners.get(event)?.delete(cb),
  }),
  disconnectSocket: vi.fn(),
}));
const emitServer = (event: string, payload: unknown) => {
  for (const cb of socketListeners.get(event) ?? []) cb(payload);
};

vi.mock('./useStartSession', () => ({
  useStartSession: () => ({ start, starting: false, error: null }),
}));

vi.mock('./useEndSession', () => ({
  useEndSession: () => ({ end: vi.fn(), ending: false, error: null }),
}));

vi.mock('../../lib/currentUser', () => ({
  useCurrentUserId: () => currentUser,
}));

const { WaitingRoom } = await import('./WaitingRoom');
const { COUNT_STEP_MS, START_MOMENT_MS } = await import('./useStartMoment');

/**
 * Live regions with something in them. The invite's copy status is always
 * there, empty until a copy, so "no banner" means none of them says anything.
 */
const spokenStatuses = () =>
  screen.queryAllByRole('status').filter((region) => region.textContent?.trim());

const session: SessionDetail = {
  id: 's1',
  code: '9FFH-BQWB',
  title: 'Random session',
  leaderId: 'leader-1',
  status: 'lobby',
  createdAt: new Date('2026-09-05T00:00:00.000Z'),
  startedAt: null,
  endedAt: null,
  discussionTimerSeconds: null,
  votingTimerSeconds: null,
  voiceEnabled: true,
  questions: [
    {
      id: 'q1',
      sessionId: 's1',
      text: 'Question 1',
      position: 0,
      status: 'pending',
      votingEnabled: true,
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
    },
  ],
};

describe('WaitingRoom', () => {
  beforeEach(() => {
    start.mockReset();
    retryJoin.mockReset();
    useVoiceRoom.mockClear();
    voice = freshVoice();
    participants = EVERYONE;
    isLive = true;
    joinFailed = false;
    currentUser = 'leader-1';
    leaveLobby = undefined;
    socketListeners.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('puts the invite on the left, the questions on the right, and Start on the table', () => {
    render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Random session' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '9FFH-BQWB' })).toBeInTheDocument();
    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start session, 2 seated' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End session' })).toBeInTheDocument();
    expect(screen.getByText('Joey, you, leader')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  // F41: the vote is set at setup or live on the agenda, never here. The
  // waiting room's agenda is read-only, for the leader as for everyone else.
  it('shows the leader which questions will not be voted on, with nothing to change it', () => {
    const brainstorm = {
      ...session,
      questions: session.questions.map((question) => ({ ...question, votingEnabled: false })),
    };
    render(<WaitingRoom session={brainstorm} onLeftLobby={() => undefined} />);

    expect(screen.getByText('Brainstorm')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /vote/i })).not.toBeInTheDocument();
  });

  it('offers the microphone from the header, so the wait is a conversation', () => {
    voice = freshVoice({
      participants: [
        { identity: 'leader-1', name: 'Joey', isLocal: true, isSpeaking: false, isMuted: false },
      ],
    });
    render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

    expect(screen.getByRole('button', { name: /Joey: microphone on/ })).toBeInTheDocument();
  });

  it('marks a muted person on the seat they already occupy', () => {
    voice = freshVoice({
      participants: [
        { identity: 'leader-1', name: 'Joey', isLocal: true, isSpeaking: false, isMuted: false },
        { identity: 'u2', name: 'Alice Smith', isLocal: false, isSpeaking: false, isMuted: true },
      ],
    });
    render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

    // The state lands on the seat that is already there.
    expect(screen.getByText('Alice Smith, muted')).toBeInTheDocument();
    expect(screen.getByText('Joey, you, leader')).toBeInTheDocument();
  });

  it('leaves a seat plain when its occupant has not reached voice', () => {
    voice = freshVoice({
      participants: [
        { identity: 'leader-1', name: 'Joey', isLocal: true, isSpeaking: false, isMuted: false },
      ],
    });
    render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

    // Not muted — unknown. Someone still connecting has said nothing about
    // their microphone, and drawing them as silent would put words in it.
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith, muted')).not.toBeInTheDocument();
  });

  it('keeps the way back into voice in the header once the banner has gone', () => {
    vi.useFakeTimers();
    voice = freshVoice({
      status: 'failed',
      micEnabled: false,
      error: 'Lost the voice connection. Reconnect to rejoin.',
    });
    render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

    act(() => {
      vi.advanceTimersByTime(NOTICE_AUTO_HIDE_MS);
    });

    // The banner has stepped aside. The header still says why and still offers
    // the way back — in the mic's place, since there is nothing to mute.
    expect(spokenStatuses()).toEqual([]);
    expect(screen.getByText('Voice offline')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /microphone/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect voice' }));
    expect(voice.retry).toHaveBeenCalledTimes(1);
  });

  it('looks like an ordinary lobby on a server with no voice', () => {
    voice = freshVoice({ status: 'unavailable', micStatus: 'idle', micEnabled: false });
    render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

    // No mic button, no banner, and the seats are exactly what they were
    // before voice existed here.
    expect(screen.queryByRole('button', { name: /microphone/i })).not.toBeInTheDocument();
    expect(spokenStatuses()).toEqual([]);
    expect(screen.getByText('Joey, you, leader')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('never joins a call for a session created with no call, and says so in the header', () => {
    // What the real hook reports when it is told not to join.
    voice = freshVoice({ status: 'unavailable', micStatus: 'idle', micEnabled: false });
    render(
      <WaitingRoom session={{ ...session, voiceEnabled: false }} onLeftLobby={() => undefined} />,
    );

    expect(useVoiceRoom).toHaveBeenLastCalledWith('s1', false);
    expect(screen.getByText('No call')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /microphone/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect voice' })).not.toBeInTheDocument();
  });

  it('joins the call for a live-call session, with no "No call" chip', () => {
    render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

    expect(useVoiceRoom).toHaveBeenLastCalledWith('s1', true);
    expect(screen.queryByText('No call')).not.toBeInTheDocument();
  });

  describe('the board’s header', () => {
    it('names the session once, and says it is waiting rather than live', () => {
      render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

      // One heading for the page: the header's. The card repeats the words only.
      expect(screen.getAllByRole('heading', { name: 'Random session' })).toHaveLength(1);
      expect(screen.getByText('Waiting room')).toBeInTheDocument();
      expect(screen.getByText('1 question')).toBeInTheDocument();
      expect(screen.getByText('Connected')).toBeInTheDocument();
      expect(screen.queryByText('Live')).not.toBeInTheDocument();
    });

    it('says it is reconnecting while the lobby’s socket is not joined', () => {
      isLive = false;
      render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

      expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    });

    // Two ways to invite are enough: the info card and People. The header's
    // Invite, which the board keeps, would be a third.
    it('invites from the info card, not the header', () => {
      render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

      expect(screen.queryByRole('button', { name: 'Invite people' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: '9FFH-BQWB' })).toBeInTheDocument();
    });

    it('gives a member Leave instead of End', () => {
      // Leave navigates to the dashboard afterwards, so it needs a router.
      render(
        <MemoryRouter>
          <WaitingRoom
            session={{ ...session, leaderId: 'someone-else' }}
            onLeftLobby={() => undefined}
          />
        </MemoryRouter>,
      );

      expect(screen.getByRole('button', { name: 'Leave session' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'End session' })).not.toBeInTheDocument();
    });
  });

  describe('People and Chat', () => {
    it('has People and Chat in its strip, and no assistant before the board exists', () => {
      render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

      const tabs = screen
        .getAllByRole('button')
        .map((button) => button.getAttribute('data-side-tab'))
        .filter(Boolean);
      expect(tabs).toEqual(['people', 'chat']);
    });

    it('opens People from the header’s faces, in the lobby’s words', async () => {
      const user = userEvent.setup();
      render(
        <WaitingRoom session={{ ...session, voiceEnabled: false }} onLeftLobby={() => undefined} />,
      );

      await user.click(screen.getByRole('button', { name: /Open the people list/ }));
      const panel = screen.getByRole('complementary', { name: 'Side panel' });
      expect(within(panel).getAllByText('In the waiting room')).toHaveLength(2);
      expect(within(panel).getByText(/Everyone joins on the board/)).toBeInTheDocument();

      // Pressed again, the faces put the list away.
      await user.click(screen.getByRole('button', { name: /Close the people list/ }));
      expect(within(panel).queryByText(/Everyone joins on the board/)).not.toBeInTheDocument();
    });

    it('gives the leader Mute all in a call session', async () => {
      const user = userEvent.setup();
      voice = freshVoice({
        participants: [
          { identity: 'leader-1', name: 'Joey', isLocal: true, isSpeaking: false, isMuted: false },
          {
            identity: 'u2',
            name: 'Alice Smith',
            isLocal: false,
            isSpeaking: false,
            isMuted: false,
          },
        ],
      });
      render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

      await user.click(screen.getByRole('button', { name: 'People' }));
      expect(screen.getByRole('button', { name: 'Mute all' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Mute Alice Smith' })).toBeInTheDocument();
    });

    it('tells someone the leader muted them', () => {
      voice = freshVoice({ micEnabled: false, mutedByLeader: true });
      render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

      expect(screen.getByText(/The leader muted you/)).toBeInTheDocument();
    });
  });

  describe('Start', () => {
    it('plays the 3-2-1 once the start has gone through, then re-reads the session', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onLeftLobby = vi.fn();
      start.mockResolvedValue({ id: 's1', status: 'active' });
      render(<WaitingRoom session={session} onLeftLobby={onLeftLobby} />);

      await user.click(screen.getByRole('button', { name: /^Start session/ }));
      expect(start).toHaveBeenCalledTimes(1);
      expect(screen.getByText('3')).toBeInTheDocument();
      // Read out once, in words, instead of the drawn countdown.
      expect(spokenStatuses().map((region) => region.textContent)).toContain(
        'The session is starting.',
      );
      expect(onLeftLobby).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(START_MOMENT_MS));
      expect(onLeftLobby).toHaveBeenCalledTimes(1);
    });

    it('stays put when the start fails', async () => {
      const user = userEvent.setup();
      const onLeftLobby = vi.fn();
      start.mockResolvedValue(null);
      render(<WaitingRoom session={session} onLeftLobby={onLeftLobby} />);

      await user.click(screen.getByRole('button', { name: /^Start session/ }));
      expect(onLeftLobby).not.toHaveBeenCalled();
      expect(screen.queryByText('3')).not.toBeInTheDocument();
    });

    // Everyone hears the broadcast: a member's table counts down too.
    it('counts a member down on the Start broadcast', () => {
      vi.useFakeTimers();
      currentUser = 'u2';
      const onLeftLobby = vi.fn();
      render(
        <MemoryRouter>
          <WaitingRoom session={session} onLeftLobby={onLeftLobby} />
        </MemoryRouter>,
      );

      act(() => leaveLobby?.('started'));
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.queryByText(/Waiting for Joey/)).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(COUNT_STEP_MS * 3));
      expect(screen.getByText('Here we go')).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(START_MOMENT_MS));
      expect(onLeftLobby).toHaveBeenCalledTimes(1);
    });

    // A rejoin that finds the session already running has nothing to count down to.
    it('goes straight on when a rejoin finds the room has moved on', () => {
      const onLeftLobby = vi.fn();
      render(<WaitingRoom session={session} onLeftLobby={onLeftLobby} />);

      act(() => leaveLobby?.('moved-on'));
      expect(onLeftLobby).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('3')).not.toBeInTheDocument();
    });

    it('asks once before the leader starts alone', async () => {
      const user = userEvent.setup();
      participants = [{ id: 'leader-1', displayName: 'Joey' }];
      start.mockResolvedValue(null);
      render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

      await user.click(screen.getByRole('button', { name: 'Start anyway, Only you so far' }));
      const dialog = screen.getByRole('dialog', { name: 'You’re the only one here' });
      expect(start).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: 'Wait' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(start).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: /^Start anyway/ }));
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Start anyway' }),
      );
      expect(start).toHaveBeenCalledTimes(1);
    });
  });

  describe('arrivals', () => {
    it('says who joined, as the board does', () => {
      render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

      act(() => emitServer('memberJoined', { user: { id: 'u9', displayName: 'Priya Shah' } }));
      expect(screen.getByText('Priya Shah joined')).toBeInTheDocument();
    });
  });

  describe('the table', () => {
    /** A member's view: Leave needs a router. */
    function renderAsMember() {
      currentUser = 'u2';
      return render(
        <MemoryRouter>
          <WaitingRoom session={session} onLeftLobby={() => undefined} />
        </MemoryRouter>,
      );
    }

    it('tells a member who they are waiting for', () => {
      renderAsMember();

      expect(screen.getByText(/Waiting for Joey to start/)).toBeInTheDocument();
      expect(screen.getByText('2 seated · the table’s set')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Start session/ })).not.toBeInTheDocument();
      expect(screen.getByText('Alice Smith, you')).toBeInTheDocument();
    });

    it('keeps the host’s chair, and says so, while the leader is away', () => {
      participants = [{ id: 'u2', displayName: 'Alice Smith' }];
      renderAsMember();

      expect(screen.getByText(/Waiting for Joey to arrive/)).toBeInTheDocument();
      expect(screen.getByText('· not here yet')).toBeInTheDocument();
      expect(screen.getByText('Host')).toBeInTheDocument();
    });

    it('seats nobody until the room has said who is in it', () => {
      participants = null;
      render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

      const table = screen.getByRole('list', { name: 'At the table' });
      expect(within(table).queryAllByRole('listitem')).toHaveLength(0);
      // Start is there, with no count it cannot know yet.
      expect(screen.getByRole('button', { name: 'Start session' })).toBeInTheDocument();
      // Nobody is called away before presence is known.
      expect(screen.queryByText('· not here yet')).not.toBeInTheDocument();
    });

    it('offers a way back in when the room would not seat you', async () => {
      const user = userEvent.setup();
      participants = null;
      joinFailed = true;
      render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

      expect(screen.getByText('Couldn’t take your seat.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(retryJoin).toHaveBeenCalledTimes(1);
    });

    it('lists the questions ahead the way the board’s agenda will', () => {
      render(<WaitingRoom session={session} onLeftLobby={() => undefined} />);

      expect(screen.getByRole('heading', { name: /Questions ahead/ })).toBeInTheDocument();
      expect(screen.getByText('Up first')).toBeInTheDocument();
    });
  });
});

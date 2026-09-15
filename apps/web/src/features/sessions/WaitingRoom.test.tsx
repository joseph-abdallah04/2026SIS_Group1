import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

// Only the hook is replaced: `MicToggle`, `VoiceNotice` and the seat helpers
// are the real ones, because how they render off this state is the thing worth
// asserting. Left unmocked, the hook would reach for a real token here.
vi.mock('../voice', async () => {
  const actual = await vi.importActual<typeof import('../voice')>('../voice');
  return { ...actual, useVoiceRoom: () => voice };
});

vi.mock('./useWaitingRoom', () => ({
  useWaitingRoom: () => ({
    participants: [
      { id: 'leader-1', displayName: 'Joey' },
      { id: 'u2', displayName: 'Alice Smith' },
    ],
    loading: false,
    error: null,
    isLive: true,
  }),
}));

vi.mock('./useStartSession', () => ({
  useStartSession: () => ({ start, starting: false, error: null }),
}));

vi.mock('./useEndSession', () => ({
  useEndSession: () => ({ end: vi.fn(), ending: false, error: null }),
}));

vi.mock('../../lib/currentUser', () => ({
  useCurrentUserId: () => 'leader-1',
}));

const { WaitingRoom } = await import('./WaitingRoom');

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
  questions: [
    {
      id: 'q1',
      sessionId: 's1',
      text: 'Question 1',
      position: 0,
      status: 'pending',
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
    },
  ],
};

describe('WaitingRoom', () => {
  beforeEach(() => {
    start.mockReset();
    voice = freshVoice();
  });

  it('puts invite on the left, questions on the right, and start in the table', () => {
    render(<WaitingRoom session={session} onStarted={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Random session' })).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveValue('9FFH-BQWB');
    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start session' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End session' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Joey, Leader' })).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Joey' })).not.toBeInTheDocument();
  });

  it('offers the microphone from the header, so the wait is a conversation', () => {
    voice = freshVoice({
      participants: [
        { identity: 'leader-1', name: 'Joey', isLocal: true, isSpeaking: false, isMuted: false },
      ],
    });
    render(<WaitingRoom session={session} onStarted={() => undefined} />);

    expect(screen.getByRole('button', { name: /Joey — microphone on/ })).toBeInTheDocument();
  });

  it('marks a muted person on the seat they already occupy', () => {
    voice = freshVoice({
      participants: [
        { identity: 'leader-1', name: 'Joey', isLocal: true, isSpeaking: false, isMuted: false },
        { identity: 'u2', name: 'Alice Smith', isLocal: false, isSpeaking: false, isMuted: true },
      ],
    });
    render(<WaitingRoom session={session} onStarted={() => undefined} />);

    // The table is the roster: the state lands on the head that is already
    // there rather than in a second list of the same people.
    expect(screen.getByRole('button', { name: 'Alice Smith, muted' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Joey, Leader' })).toBeInTheDocument();
  });

  it('leaves a seat plain when its occupant has not reached voice', () => {
    voice = freshVoice({
      participants: [
        { identity: 'leader-1', name: 'Joey', isLocal: true, isSpeaking: false, isMuted: false },
      ],
    });
    render(<WaitingRoom session={session} onStarted={() => undefined} />);

    // Not muted — unknown. Someone still connecting has said nothing about
    // their microphone, and drawing them as silent would put words in it.
    expect(screen.getByRole('button', { name: 'Alice Smith' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alice Smith, muted' })).not.toBeInTheDocument();
  });

  it('looks like an ordinary lobby on a server with no voice', () => {
    voice = freshVoice({ status: 'unavailable', micStatus: 'idle', micEnabled: false });
    render(<WaitingRoom session={session} onStarted={() => undefined} />);

    // No mic button, no banner, and the seats are exactly what they were
    // before voice existed here.
    expect(screen.queryByRole('button', { name: /microphone/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Joey, Leader' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alice Smith' })).toBeInTheDocument();
  });
});

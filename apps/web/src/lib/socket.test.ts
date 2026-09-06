import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const emit = vi.fn();
const disconnect = vi.fn();

vi.mock('socket.io-client', () => ({
  io: () => ({ emit, disconnect, connected: true, on: vi.fn() }),
}));

vi.mock('./auth', () => ({ getToken: () => 'tok' }));

const { disconnectSocket, joinSessionRoom, scheduleLeaveSessionRoom } = await import('./socket');

beforeEach(() => {
  emit.mockClear();
  disconnect.mockClear();
});

afterEach(() => {
  disconnectSocket();
  vi.useRealTimers();
});

describe('joinSessionRoom / scheduleLeaveSessionRoom', () => {
  it('emits memberJoin immediately', () => {
    joinSessionRoom('s1');
    expect(emit).toHaveBeenCalledWith('memberJoin', { sessionId: 's1' }, undefined);
  });

  it('defers memberLeave so a remount can cancel it', () => {
    vi.useFakeTimers();
    scheduleLeaveSessionRoom('s1');
    expect(emit).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(emit).toHaveBeenCalledWith('memberLeave', { sessionId: 's1' });
  });

  it('cancels a pending leave when the same session is joined again', () => {
    vi.useFakeTimers();
    scheduleLeaveSessionRoom('s1');
    joinSessionRoom('s1');
    vi.runAllTimers();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('memberJoin', { sessionId: 's1' }, undefined);
  });

  it('does not emit a pending leave after disconnectSocket', () => {
    vi.useFakeTimers();
    scheduleLeaveSessionRoom('s1');
    disconnectSocket();
    vi.runAllTimers();

    expect(emit).not.toHaveBeenCalled();
  });
});

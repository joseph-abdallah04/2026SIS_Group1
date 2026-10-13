import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const muteInCall = vi.fn<(sessionId: string, identity?: string) => Promise<{ muted: number }>>();
vi.mock('./voiceApi', () => ({
  muteInCall: (sessionId: string, identity?: string) => muteInCall(sessionId, identity),
}));

const { MUTE_ALL, useLeaderMute } = await import('./useLeaderMute');

afterEach(() => {
  muteInCall.mockReset();
});

describe('useLeaderMute', () => {
  it('mutes one person, or everyone when nobody is named', async () => {
    muteInCall.mockResolvedValue({ muted: 1 });
    const { result } = renderHook(() => useLeaderMute('s1'));

    await act(async () => {
      await result.current.mute('u2');
    });
    expect(muteInCall).toHaveBeenLastCalledWith('s1', 'u2');

    await act(async () => {
      await result.current.mute();
    });
    expect(muteInCall).toHaveBeenLastCalledWith('s1', undefined);
    expect(result.current.error).toBeNull();
  });

  it('marks each request as pending until it settles', async () => {
    let finish: () => void = () => undefined;
    muteInCall.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ muted: 1 });
        }),
    );
    const { result } = renderHook(() => useLeaderMute('s1'));

    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.mute();
    });
    expect(result.current.pending.has(MUTE_ALL)).toBe(true);

    await act(async () => {
      finish();
      await done;
    });
    expect(result.current.pending.size).toBe(0);
  });

  it('says so when a mute does not go through, and clears that on the next try', async () => {
    muteInCall.mockRejectedValueOnce(new Error('403'));
    const { result } = renderHook(() => useLeaderMute('s1'));

    await act(async () => {
      await result.current.mute('u2');
    });
    expect(result.current.error).toMatch(/could not mute/i);
    expect(result.current.pending.size).toBe(0);

    muteInCall.mockResolvedValue({ muted: 1 });
    await act(async () => {
      await result.current.mute('u2');
    });
    expect(result.current.error).toBeNull();
  });
});

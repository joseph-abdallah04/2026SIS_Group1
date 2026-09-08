import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SPEAKING_HOLD_MS, useSustainedSpeaking } from './useSustainedSpeaking';
import type { VoiceParticipant } from './useVoiceRoom';

function person(overrides: Partial<VoiceParticipant> & { identity: string }): VoiceParticipant {
  return {
    name: overrides.identity,
    isLocal: false,
    isSpeaking: false,
    isMuted: false,
    ...overrides,
  };
}

/** Let scheduled tails fire. */
function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useSustainedSpeaking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lights up the moment someone starts, with no delay', () => {
    // F13 wants a reaction within ~0.5s of speech starting, so the rising edge
    // must not be smoothed at all.
    const { result, rerender } = renderHook(
      ({ people }: { people: VoiceParticipant[] }) => useSustainedSpeaking(people),
      { initialProps: { people: [person({ identity: 'u1' })] } },
    );

    expect(result.current.has('u1')).toBe(false);

    rerender({ people: [person({ identity: 'u1', isSpeaking: true })] });
    expect(result.current.has('u1')).toBe(true);
  });

  it('holds the ring through the gaps between words', () => {
    const { result, rerender } = renderHook(
      ({ people }: { people: VoiceParticipant[] }) => useSustainedSpeaking(people),
      { initialProps: { people: [person({ identity: 'u1', isSpeaking: true })] } },
    );

    rerender({ people: [person({ identity: 'u1', isSpeaking: false })] });
    // Still ringed: this is a pause, not the end of a sentence.
    advance(SPEAKING_HOLD_MS - 100);
    expect(result.current.has('u1')).toBe(true);

    advance(200);
    expect(result.current.has('u1')).toBe(false);
  });

  it('cancels the tail when speech resumes inside it', () => {
    const { result, rerender } = renderHook(
      ({ people }: { people: VoiceParticipant[] }) => useSustainedSpeaking(people),
      { initialProps: { people: [person({ identity: 'u1', isSpeaking: true })] } },
    );

    rerender({ people: [person({ identity: 'u1', isSpeaking: false })] });
    advance(SPEAKING_HOLD_MS - 100);
    rerender({ people: [person({ identity: 'u1', isSpeaking: true })] });

    // The original tail must not fire and switch the ring off mid-sentence.
    advance(SPEAKING_HOLD_MS);
    expect(result.current.has('u1')).toBe(true);
  });

  it('drops the ring immediately when someone mutes', () => {
    const { result, rerender } = renderHook(
      ({ people }: { people: VoiceParticipant[] }) => useSustainedSpeaking(people),
      { initialProps: { people: [person({ identity: 'u1', isSpeaking: true })] } },
    );

    // A stale speaking frame can still be in flight as the track goes quiet;
    // muted has to win, or the ring contradicts the red-slash mic beside it.
    rerender({ people: [person({ identity: 'u1', isSpeaking: true, isMuted: true })] });
    expect(result.current.has('u1')).toBe(false);
  });

  it('drops the ring immediately when someone leaves', () => {
    const { result, rerender } = renderHook(
      ({ people }: { people: VoiceParticipant[] }) => useSustainedSpeaking(people),
      {
        initialProps: {
          people: [person({ identity: 'u1', isSpeaking: true }), person({ identity: 'u2' })],
        },
      },
    );

    expect(result.current.has('u1')).toBe(true);

    rerender({ people: [person({ identity: 'u2' })] });
    expect(result.current.has('u1')).toBe(false);
  });

  it('tracks several people at once without confusing their tails', () => {
    const { result, rerender } = renderHook(
      ({ people }: { people: VoiceParticipant[] }) => useSustainedSpeaking(people),
      {
        initialProps: {
          people: [
            person({ identity: 'u1', isSpeaking: true }),
            person({ identity: 'u2', isSpeaking: true }),
            person({ identity: 'u3' }),
          ],
        },
      },
    );

    expect([...result.current].sort()).toEqual(['u1', 'u2']);

    // u1 stops, u2 keeps going, u3 starts.
    rerender({
      people: [
        person({ identity: 'u1' }),
        person({ identity: 'u2', isSpeaking: true }),
        person({ identity: 'u3', isSpeaking: true }),
      ],
    });
    advance(SPEAKING_HOLD_MS + 50);

    expect([...result.current].sort()).toEqual(['u2', 'u3']);
  });

  it('does not fire a pending tail after unmount', () => {
    const { rerender, unmount } = renderHook(
      ({ people }: { people: VoiceParticipant[] }) => useSustainedSpeaking(people),
      { initialProps: { people: [person({ identity: 'u1', isSpeaking: true })] } },
    );

    rerender({ people: [person({ identity: 'u1', isSpeaking: false })] });
    unmount();

    // Leaving the session mid-tail must not set state on a gone component.
    expect(() => advance(SPEAKING_HOLD_MS + 50)).not.toThrow();
  });
});

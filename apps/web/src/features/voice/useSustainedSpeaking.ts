import { useEffect, useRef, useState } from 'react';

import type { VoiceParticipant } from './useVoiceRoom';

/**
 * How long a ring outlives the last speech that lit it.
 *
 * Natural speech is full of gaps — the pause between two words is long enough
 * for LiveKit's audio level to drop under its threshold — so a ring wired
 * straight to `isSpeaking` strobes at roughly syllable rate. The tail is what
 * turns "is making sound right now" into "is talking", which is what the rail
 * is actually reporting.
 *
 * Short enough that a finished sentence releases the ring quickly, and it only
 * ever delays the *end* — F13 asks for a reaction within ~0.5s of someone
 * starting, and starting is never held back by this.
 */
export const SPEAKING_HOLD_MS = 600;

const NO_ONE: ReadonlySet<string> = new Set();

/**
 * Who the rail should show as speaking (F13), de-flickered.
 *
 * Rising edges pass through untouched; falling edges wait out {@link
 * SPEAKING_HOLD_MS}. Two things skip the tail on purpose, because in both the
 * ring would be making a claim that is no longer true rather than smoothing
 * one that is: muting yourself, and leaving the room.
 */
export function useSustainedSpeaking(
  participants: readonly VoiceParticipant[],
): ReadonlySet<string> {
  const [speaking, setSpeaking] = useState<ReadonlySet<string>>(NO_ONE);
  /**
   * The authority on who is speaking. State mirrors it for rendering, but the
   * effect below must not depend on `speaking` — reading it there would make
   * every publish re-run the effect and reschedule the timers it just set.
   */
  const liveRef = useRef<Set<string>>(new Set());
  /** Pending falling edges, one per identity, so a resume can cancel its own. */
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const live = liveRef.current;
    const timers = timersRef.current;
    const present = new Set(participants.map((person) => person.identity));
    let changed = false;

    const stopHolding = (identity: string) => {
      const pending = timers.get(identity);
      if (pending === undefined) return;
      clearTimeout(pending);
      timers.delete(identity);
    };

    // Gone from the room is gone from the list: a dropped connection must not
    // leave a ring glowing for someone who is no longer on anyone's screen.
    for (const identity of [...live]) {
      if (present.has(identity)) continue;
      live.delete(identity);
      changed = true;
    }
    for (const identity of [...timers.keys()]) {
      if (!present.has(identity)) stopHolding(identity);
    }

    for (const person of participants) {
      const { identity } = person;

      // Muted wins over speaking. LiveKit can hand us one last speaking frame
      // that was already in flight when the track went quiet, and honouring it
      // would show a green ring beside a red-slash mic.
      if (person.isMuted) {
        stopHolding(identity);
        if (live.delete(identity)) changed = true;
        continue;
      }

      if (person.isSpeaking) {
        stopHolding(identity);
        if (!live.has(identity)) {
          live.add(identity);
          changed = true;
        }
        continue;
      }

      // Fell silent. Only worth a timer if they were speaking and no tail is
      // already running for them.
      if (!live.has(identity) || timers.has(identity)) continue;
      timers.set(
        identity,
        setTimeout(() => {
          timers.delete(identity);
          if (!liveRef.current.delete(identity)) return;
          setSpeaking(new Set(liveRef.current));
        }, SPEAKING_HOLD_MS),
      );
    }

    if (changed) setSpeaking(new Set(live));
  }, [participants]);

  // Unmounting mid-tail would otherwise fire a `setSpeaking` into a component
  // that is gone.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const pending of timers.values()) clearTimeout(pending);
      timers.clear();
    };
  }, []);

  return speaking;
}

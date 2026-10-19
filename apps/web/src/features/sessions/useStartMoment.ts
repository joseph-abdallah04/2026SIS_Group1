import { useCallback, useEffect, useRef, useState } from 'react';

/** Each beat of the 3-2-1. Matches `rt-table-count` in index.css. */
export const COUNT_STEP_MS = 700;
/** The table lit up, everyone leaning in, before the board takes over. */
export const LIT_MS = 500;
/** From Start to the board, when motion is allowed. */
export const START_MOMENT_MS = COUNT_STEP_MS * 3 + LIT_MS;

export type StartMoment =
  { phase: 'idle' } | { phase: 'counting'; count: 3 | 2 | 1 } | { phase: 'lit' };

/**
 * The moment the session starts: a 3-2-1 on the tabletop for everyone, then
 * the table lights up, then `onDone` (which swaps the lobby for the board).
 *
 * Begun by the `sessionStarted` broadcast, and by the leader's own Start in
 * case their socket missed it. Whichever comes first wins; the other is a
 * no-op. With reduced motion there is no countdown: `onDone` runs at once.
 */
export function useStartMoment(onDone: () => void, reduceMotion: boolean) {
  const [moment, setMoment] = useState<StartMoment>({ phase: 'idle' });
  const begun = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, []);

  const begin = useCallback(() => {
    if (begun.current) return;
    begun.current = true;
    if (reduceMotion) {
      onDoneRef.current();
      return;
    }
    const at = (ms: number, run: () => void) => timers.current.push(setTimeout(run, ms));
    setMoment({ phase: 'counting', count: 3 });
    at(COUNT_STEP_MS, () => setMoment({ phase: 'counting', count: 2 }));
    at(COUNT_STEP_MS * 2, () => setMoment({ phase: 'counting', count: 1 }));
    at(COUNT_STEP_MS * 3, () => setMoment({ phase: 'lit' }));
    at(START_MOMENT_MS, () => onDoneRef.current());
  }, [reduceMotion]);

  return { moment, begin };
}

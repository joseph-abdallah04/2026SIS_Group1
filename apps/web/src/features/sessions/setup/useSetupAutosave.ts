import { useCallback, useEffect, useRef, useState } from 'react';

import { clearSetup, readSetup, writeSetup, type SavedSetup } from './setupAutosave';
import type { SetupFormState } from './useSessionSetupForm';

/** How long after the last change the form is kept. */
export const AUTOSAVE_MS = 400;

interface UseSetupAutosaveOptions {
  /** Where to keep it (`setupAutosaveKey`); none keeps nothing and offers nothing. */
  key: string | null;
  state: SetupFormState;
  /** Whether there is anything of the leader's to keep; when not, the kept copy goes. */
  hasUnsavedWork: boolean;
}

/**
 * Keeps a new session's form in this browser while it is written, and offers
 * a kept one back.
 *
 * Writes wait `AUTOSAVE_MS` after the last change. None are made while a kept
 * form is on offer (that would overwrite it), nor once the form has been sent:
 * `markSent` cancels a write still waiting, and a write checks again as it
 * fires. A form that has gone to the server must never be offered back, or
 * picking it up would make the session a second time.
 *
 * One form is kept at a time. Writing something new without answering the
 * offer answers it: the offer goes, and the new work is what is kept from then
 * on, so it is never the new work that is lost.
 */
export function useSetupAutosave({ key, state, hasUnsavedWork }: UseSetupAutosaveOptions) {
  const [kept, setKept] = useState<SavedSetup | null>(() => (key ? readSetup(key) : null));
  const sent = useRef<SetupFormState | null>(null);
  const pending = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (kept && hasUnsavedWork) setKept(null);
  }, [kept, hasUnsavedWork]);

  useEffect(() => {
    if (!key || kept || sent.current === state) return;
    pending.current = window.setTimeout(() => {
      pending.current = undefined;
      if (sent.current === state) return;
      if (hasUnsavedWork) writeSetup(key, state);
      else clearSetup(key);
    }, AUTOSAVE_MS);
    return () => {
      window.clearTimeout(pending.current);
      pending.current = undefined;
    };
  }, [key, kept, state, hasUnsavedWork]);

  /** This state has been sent: keep nothing for it. The next change keeps the form again. */
  const markSent = useCallback((sentState: SetupFormState) => {
    sent.current = sentState;
    window.clearTimeout(pending.current);
    pending.current = undefined;
  }, []);

  /** The kept form, taken to pick up; it is offered no more. */
  const take = useCallback((): SavedSetup | null => {
    const taking = kept;
    setKept(null);
    return taking;
  }, [kept]);

  /** "Start fresh": the kept form goes, here and in storage. */
  const discard = useCallback(() => {
    clearSetup(key);
    setKept(null);
  }, [key]);

  return { kept, markSent, take, discard };
}

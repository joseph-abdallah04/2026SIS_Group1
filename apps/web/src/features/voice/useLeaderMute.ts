import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiClientError } from '../../lib/api';
import { NOTICE_AUTO_HIDE_MS } from './VoiceNotice';
import { muteInCall } from './voiceApi';

/** The key `pending` uses for "Mute all", which has no one person to name. */
export const MUTE_ALL = '*';

const NOTHING_PENDING: ReadonlySet<string> = new Set();

export interface LeaderMute {
  /** Mute one person by identity, or everyone but the leader with no argument. */
  mute: (identity?: string) => Promise<void>;
  /** Identities with a mute on its way, and `MUTE_ALL` while that one is. */
  pending: ReadonlySet<string>;
  /** Why the last mute did not go through, for a few seconds or until the next one. */
  error: string | null;
}

/** What to tell the leader when a mute does not go through. */
function failureMessage(err: unknown, everyone: boolean): string {
  // The server's limit (30 a minute, shared by every mute button).
  if (err instanceof ApiClientError && err.code === 'RATE_LIMITED') {
    return 'Too many mutes at once. Try again in a moment.';
  }
  return everyone ? 'Could not mute everyone. Try again.' : 'Could not mute them. Try again.';
}

/**
 * The leader's mute buttons (F12): one per person and one for everyone.
 *
 * Success changes nothing here. The microphones go off in LiveKit, and the
 * room tells every screen, this one included, the way it reports any mute.
 * Only the request in flight and a failure are this hook's to hold. A failure
 * steps aside after as long as a voice notice does, rather than sitting at the
 * top of the People panel until the next press.
 */
export function useLeaderMute(sessionId: string): LeaderMute {
  const [pending, setPending] = useState<ReadonlySet<string>>(NOTHING_PENDING);
  const [error, setError] = useState<string | null>(null);
  const clearTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(clearTimer.current), []);

  const mute = useCallback(
    async (identity?: string) => {
      const key = identity ?? MUTE_ALL;
      window.clearTimeout(clearTimer.current);
      setError(null);
      setPending((current) => new Set(current).add(key));
      try {
        await muteInCall(sessionId, identity);
      } catch (err) {
        setError(failureMessage(err, identity === undefined));
        window.clearTimeout(clearTimer.current);
        clearTimer.current = window.setTimeout(() => setError(null), NOTICE_AUTO_HIDE_MS);
      } finally {
        setPending((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [sessionId],
  );

  return { mute, pending, error };
}

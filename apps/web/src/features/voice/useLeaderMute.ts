import { useCallback, useState } from 'react';

import { muteInCall } from './voiceApi';

/** The key `pending` uses for "Mute all", which has no one person to name. */
export const MUTE_ALL = '*';

const NOTHING_PENDING: ReadonlySet<string> = new Set();

export interface LeaderMute {
  /** Mute one person by identity, or everyone but the leader with no argument. */
  mute: (identity?: string) => Promise<void>;
  /** Identities with a mute on its way, and `MUTE_ALL` while that one is. */
  pending: ReadonlySet<string>;
  /** Why the last mute did not go through, until the next one is tried. */
  error: string | null;
}

/**
 * The leader's mute buttons (F12): one per person and one for everyone.
 *
 * Success changes nothing here. The microphones go off in LiveKit, and the
 * room tells every screen, this one included, the way it reports any mute.
 * Only the request in flight and a failure are this hook's to hold.
 */
export function useLeaderMute(sessionId: string): LeaderMute {
  const [pending, setPending] = useState<ReadonlySet<string>>(NOTHING_PENDING);
  const [error, setError] = useState<string | null>(null);

  const mute = useCallback(
    async (identity?: string) => {
      const key = identity ?? MUTE_ALL;
      setError(null);
      setPending((current) => new Set(current).add(key));
      try {
        await muteInCall(sessionId, identity);
      } catch {
        setError(
          identity === undefined
            ? 'Could not mute everyone. Try again.'
            : 'Could not mute them. Try again.',
        );
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

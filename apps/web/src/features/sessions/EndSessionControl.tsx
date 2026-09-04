import { useState } from 'react';

import { useEndSession } from './useEndSession';

interface EndSessionControlProps {
  sessionId: string;
  /** Extra classes — the pinboard header is a coloured bar, the waiting room is not. */
  className?: string;
}

/**
 * F32: the leader's way out, and the counterpart to a member's
 * `LeaveSessionControl` — the leader cannot leave their own session
 * (LEADER_CANNOT_LEAVE), they end it for everyone.
 *
 * Two clicks, not one: ending is irreversible (the board stops accepting
 * proposals and the join code is released), so the confirm step is part of the
 * feature rather than a nicety. Nothing navigates on success — the server's
 * `sessionEnded` broadcast moves this client to the final screen along with
 * everybody else's.
 */
export function EndSessionControl({ sessionId, className }: EndSessionControlProps) {
  const [confirming, setConfirming] = useState(false);
  const { end, ending, error } = useEndSession(sessionId);

  return (
    <div className={className}>
      {confirming ? (
        <span className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="opacity-80">End for everyone? This cannot be undone.</span>
          <button
            type="button"
            onClick={() => void end()}
            disabled={ending}
            className="font-semibold hover:underline"
          >
            {ending ? 'Ending…' : 'Yes, end session'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="opacity-80 hover:underline"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-[12px] font-semibold hover:underline"
        >
          End session
        </button>
      )}
      {/* Own background rather than inherited colour, for the same reason as
          `LeaveSessionControl`: this renders on the pinboard's dark header and
          on the waiting room's white page. */}
      {error && (
        <p className="mt-1 rounded bg-white px-2 py-1 text-[12px] text-red-600 shadow-sm">
          {error}
        </p>
      )}
    </div>
  );
}

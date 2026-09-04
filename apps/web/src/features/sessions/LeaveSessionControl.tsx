import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useLeaveSession } from './useLeaveSession';

interface LeaveSessionControlProps {
  sessionId: string;
  /** Extra classes — pinboard header is on a coloured bar, waiting room is not. */
  className?: string;
}

/**
 * F07: explicit leave, on the waiting room and pinboard — not the dashboard.
 * Confirm-then-POST, then `/dashboard`. Leaders never see this; they cannot
 * leave (LEADER_CANNOT_LEAVE) and must end the session instead (F32).
 */
export function LeaveSessionControl({ sessionId, className }: LeaveSessionControlProps) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const { leave, leaving, error } = useLeaveSession();

  async function handleLeave() {
    if (await leave(sessionId)) navigate('/dashboard');
  }

  return (
    <div className={className}>
      {confirming ? (
        <span className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="opacity-80">Leave this session?</span>
          <button
            type="button"
            onClick={() => void handleLeave()}
            disabled={leaving}
            className="font-semibold hover:underline"
          >
            {leaving ? 'Leaving…' : 'Yes, leave'}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="opacity-80 hover:underline">
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-[12px] font-semibold hover:underline"
        >
          Leave session
        </button>
      )}
      {/* Own background rather than inherited colour: this renders both on the
          pinboard's dark header and on the waiting room's white page, and a
          bare red would be unreadable on one of the two. */}
      {error && (
        <p className="mt-1 rounded bg-white px-2 py-1 text-[12px] text-red-600 shadow-sm">
          {error}
        </p>
      )}
    </div>
  );
}

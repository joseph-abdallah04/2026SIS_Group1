import { useState } from 'react';

import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useEndSession } from './useEndSession';

interface EndSessionControlProps {
  sessionId: string;
  /** Extra classes on the trigger wrapper. */
  className?: string;
}

const TRIGGER =
  'rounded-full bg-red-600 px-3 py-[5px] text-[12px] font-semibold text-white shadow-sm hover:bg-red-700';

/**
 * F32: the leader's way out, and the counterpart to a member's
 * `LeaveSessionControl` — the leader cannot leave their own session
 * (LEADER_CANNOT_LEAVE), they end it for everyone.
 *
 * Two clicks, not one: ending is irreversible. Nothing navigates on success —
 * the server's `sessionEnded` broadcast moves this client to the final screen
 * along with everybody else's.
 */
export function EndSessionControl({ sessionId, className }: EndSessionControlProps) {
  const [confirming, setConfirming] = useState(false);
  const { end, ending, error } = useEndSession(sessionId);

  return (
    <div className={className}>
      <button type="button" onClick={() => setConfirming(true)} className={TRIGGER}>
        End session
      </button>
      {confirming && (
        <ConfirmDialog
          title="End this session for everyone?"
          confirmLabel="End session"
          confirmingLabel="Ending…"
          busy={ending}
          onConfirm={() => void end()}
          onCancel={() => setConfirming(false)}
        >
          This cannot be undone. The board becomes read-only and the join code is released.
        </ConfirmDialog>
      )}
      {error && (
        <p className="mt-1 rounded bg-white px-2 py-1 text-[12px] text-red-600 shadow-sm">
          {error}
        </p>
      )}
    </div>
  );
}

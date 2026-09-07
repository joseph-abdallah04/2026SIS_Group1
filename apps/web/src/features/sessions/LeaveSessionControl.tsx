import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { disconnectSocket } from '../../lib/socket';
import { useLeaveSession } from './useLeaveSession';

interface LeaveSessionControlProps {
  sessionId: string;
  /** Extra classes on the trigger wrapper. */
  className?: string;
}

const TRIGGER =
  'rounded-full bg-red-600 px-3 py-[5px] text-[12px] font-semibold text-white shadow-sm hover:bg-red-700';

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
    if (!(await leave(sessionId))) return;
    disconnectSocket();
    navigate('/dashboard', { replace: true });
  }

  return (
    <div className={className}>
      <button type="button" onClick={() => setConfirming(true)} className={TRIGGER}>
        Leave session
      </button>
      {confirming && (
        <ConfirmDialog
          title="Leave this session?"
          confirmLabel="Leave session"
          confirmingLabel="Leaving…"
          busy={leaving}
          onConfirm={() => void handleLeave()}
          onCancel={() => setConfirming(false)}
        >
          You will drop off the live list. You can rejoin later with the code or link if the session
          is still open.
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

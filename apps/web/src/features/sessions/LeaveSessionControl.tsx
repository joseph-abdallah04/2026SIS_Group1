import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { disconnectSocket } from '../../lib/socket';
import { useLeaveSession } from './useLeaveSession';

interface LeaveSessionControlProps {
  sessionId: string;
  /** Extra classes on the trigger wrapper. */
  className?: string;
  /**
   * `pill`, a solid red button, for the waiting room. `header` for the board's
   * shorter header: a quiet "Leave" that only turns red when pointed at. A
   * member leaving costs nobody else anything, unlike the leader's End.
   */
  variant?: 'pill' | 'header';
}

const TRIGGER: Record<'pill' | 'header', string> = {
  pill: 'rounded-full bg-red-600 px-3 py-[5px] text-[12px] font-semibold text-white shadow-sm hover:bg-red-700',
  header:
    'h-8 rounded-full px-3 text-[12.5px] font-semibold whitespace-nowrap text-rt-ink-muted transition-colors hover:bg-[#fdecea] hover:text-[#b42318] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary',
};

/** Under the trigger in the header, so a failure does not make the header taller. */
const ERROR: Record<'pill' | 'header', string> = {
  pill: 'mt-1 rounded bg-white px-2 py-1 text-[12px] text-red-600 shadow-sm',
  header:
    'absolute top-full right-0 z-40 mt-2 w-max max-w-64 rounded bg-white px-2 py-1 text-[12px] text-red-600 shadow-sm',
};

/**
 * F07: explicit leave, on the waiting room and pinboard — not the dashboard.
 * Confirm-then-POST, then `/dashboard`. Leaders never see this; they cannot
 * leave (LEADER_CANNOT_LEAVE) and must end the session instead (F32).
 */
export function LeaveSessionControl({
  sessionId,
  className,
  variant = 'pill',
}: LeaveSessionControlProps) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const { leave, leaving, error } = useLeaveSession();

  async function handleLeave() {
    if (!(await leave(sessionId))) return;
    disconnectSocket();
    navigate('/dashboard', { replace: true });
  }

  return (
    <div className={`${variant === 'header' ? 'relative' : ''} ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        // The header's word is shorter; its name still says what it leaves.
        aria-label={variant === 'header' ? 'Leave session' : undefined}
        className={TRIGGER[variant]}
      >
        {variant === 'header' ? 'Leave' : 'Leave session'}
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
      {error && <p className={ERROR[variant]}>{error}</p>}
    </div>
  );
}

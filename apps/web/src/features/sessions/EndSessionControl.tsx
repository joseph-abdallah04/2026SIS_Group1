import { useState } from 'react';

import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useEndSession } from './useEndSession';

interface EndSessionControlProps {
  sessionId: string;
  /** Extra classes on the trigger wrapper. */
  className?: string;
  /**
   * `pill`, a solid red button, for the waiting room. `header` for the board's
   * shorter header: a red outline, so the one destructive control there reads
   * as one without being the loudest thing on the screen.
   */
  variant?: 'pill' | 'header';
}

const TRIGGER: Record<'pill' | 'header', string> = {
  pill: 'rounded-full bg-red-600 px-3 py-[5px] text-[12px] font-semibold text-white shadow-sm hover:bg-red-700',
  header:
    'h-8 rounded-full border border-red-600/35 px-3 text-[12.5px] font-semibold whitespace-nowrap text-[#b42318] transition-colors hover:bg-[#fdecea] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary',
};

/** Under the trigger in the header, so a failure does not make the header taller. */
const ERROR: Record<'pill' | 'header', string> = {
  pill: 'mt-1 rounded bg-white px-2 py-1 text-[12px] text-red-600 shadow-sm',
  header:
    'absolute top-full right-0 z-40 mt-2 w-max max-w-64 rounded bg-white px-2 py-1 text-[12px] text-red-600 shadow-sm',
};

/**
 * F32: the leader's way out, and the counterpart to a member's
 * `LeaveSessionControl` — the leader cannot leave their own session
 * (LEADER_CANNOT_LEAVE), they end it for everyone.
 *
 * Two clicks, not one: ending is irreversible. Nothing navigates on success —
 * the server's `sessionEnded` broadcast moves this client to the final screen
 * along with everybody else's.
 */
export function EndSessionControl({
  sessionId,
  className,
  variant = 'pill',
}: EndSessionControlProps) {
  const [confirming, setConfirming] = useState(false);
  const { end, ending, error } = useEndSession(sessionId);

  return (
    <div className={`${variant === 'header' ? 'relative' : ''} ${className ?? ''}`}>
      <button type="button" onClick={() => setConfirming(true)} className={TRIGGER[variant]}>
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
      {error && <p className={ERROR[variant]}>{error}</p>}
    </div>
  );
}

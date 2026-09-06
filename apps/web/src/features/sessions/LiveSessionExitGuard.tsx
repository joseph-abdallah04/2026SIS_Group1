import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { disconnectSocket } from '../../lib/socket';
import { useEndSession } from './useEndSession';
import { useLeaveSession } from './useLeaveSession';

interface LiveSessionExitGuardProps {
  sessionId: string;
  /** Lobby or active — drafts can be left without leaving/ending anything. */
  enabled: boolean;
  isLeader: boolean;
  /** Leader's own client after a confirmed end, so they don't wait on a socket they are about to drop. */
  onEnded: () => void;
}

/**
 * Browser Back while a session is live is not a silent walk-away: the SPA
 * would leave the socket in the room (so the leader "leaves" without ending,
 * and nobody else is told). Intercept the history pop, keep this URL on
 * screen, and ask first.
 *
 * Members who confirm actually leave (REST + socket). The leader who confirms
 * ends the session for everyone — they cannot leave their own session.
 */
export function LiveSessionExitGuard({
  sessionId,
  enabled,
  isLeader,
  onEnded,
}: LiveSessionExitGuardProps) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const { leave, leaving, error: leaveError } = useLeaveSession();
  const { end, ending, error: endError } = useEndSession(sessionId);
  const busy = leaving || ending;
  const error = isLeader ? endError : leaveError;

  useEffect(() => {
    if (!enabled) setPending(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    const path = `/sessions/${sessionId}`;
    const onPop = () => {
      window.history.pushState({ rtLiveSession: sessionId }, '', path);
      setPending(true);
    };
    window.history.pushState({ rtLiveSession: sessionId }, '', path);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [sessionId, enabled]);

  async function confirm() {
    if (isLeader) {
      const session = await end();
      if (!session) return;
      setPending(false);
      onEnded();
      return;
    }
    if (!(await leave(sessionId))) return;
    disconnectSocket();
    navigate('/dashboard', { replace: true });
  }

  if (!pending) return null;

  return isLeader ? (
    <ConfirmDialog
      title="End this session for everyone?"
      confirmLabel="End session"
      confirmingLabel="Ending…"
      busy={busy}
      onConfirm={() => void confirm()}
      onCancel={() => setPending(false)}
    >
      <p>
        Going back does not pause the session — as leader, leaving this page ends it for everyone in
        the room. This cannot be undone.
      </p>
      {error ? <p className="mt-2 text-red-600">{error}</p> : null}
    </ConfirmDialog>
  ) : (
    <ConfirmDialog
      title="Leave this session?"
      confirmLabel="Leave session"
      confirmingLabel="Leaving…"
      busy={busy}
      onConfirm={() => void confirm()}
      onCancel={() => setPending(false)}
    >
      <p>
        Going back will take you out of the session. You can rejoin later with the code or link if
        it is still open.
      </p>
      {error ? <p className="mt-2 text-red-600">{error}</p> : null}
    </ConfirmDialog>
  );
}

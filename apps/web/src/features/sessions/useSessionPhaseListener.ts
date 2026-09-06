import { useEffect } from 'react';
import type { QuestionStatus } from '@roundtable/shared';

import { getSocket } from '../../lib/socket';

/**
 * F25/F26: react to the leader moving the agenda.
 *
 * Two things listen for `sessionPhase` independently rather than one thing
 * listening and telling the other: the agenda panel needs the new *status*
 * (this hook), and the board needs to re-read *which question* it is showing
 * (`usePinboard`). Neither derives from the other, and coupling them would
 * mean threading a board reload through the session router.
 */
export function useSessionPhaseListener(
  sessionId: string,
  onPhase: (questionId: string, status: QuestionStatus) => void,
) {
  useEffect(() => {
    if (!sessionId) return;
    const socket = getSocket();

    const handle = (payload: {
      sessionId: string;
      questionId: string;
      status: QuestionStatus;
    }) => {
      // A socket can be moved between sessions (see the gateway's room swap),
      // so an event for a different session is possible and must be ignored.
      if (payload.sessionId !== sessionId) return;
      onPhase(payload.questionId, payload.status);
    };

    socket.on('sessionPhase', handle);
    return () => {
      socket.off('sessionPhase', handle);
    };
  }, [sessionId, onPhase]);
}

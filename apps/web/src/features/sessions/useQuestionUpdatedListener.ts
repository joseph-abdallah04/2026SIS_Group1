import { useEffect } from 'react';
import type { Question } from '@roundtable/shared';

import { getSocket } from '../../lib/socket';

/**
 * F41: patch a question the leader turned the vote on or off for. Same shape
 * as `useQuestionAddedListener` — the agenda lives on the session detail, so
 * this updates that list in place rather than reloading the live view.
 */
export function useQuestionUpdatedListener(
  sessionId: string,
  onUpdated: (question: Question) => void,
) {
  useEffect(() => {
    if (!sessionId) return;
    const socket = getSocket();

    const handle = (payload: { sessionId: string; question: Question }) => {
      if (payload.sessionId !== sessionId) return;
      onUpdated(payload.question);
    };

    socket.on('questionUpdated', handle);
    return () => {
      socket.off('questionUpdated', handle);
    };
  }, [sessionId, onUpdated]);
}

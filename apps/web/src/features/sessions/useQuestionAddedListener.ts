import { useEffect } from 'react';
import type { Question } from '@roundtable/shared';

import { getSocket } from '../../lib/socket';

/**
 * Insert a question the leader just added. The agenda list lives on the
 * session detail, so this patches that list in place — a full reload would
 * blank the live view the same way a phase change used to.
 */
export function useQuestionAddedListener(
  sessionId: string,
  onAdded: (question: Question) => void,
) {
  useEffect(() => {
    if (!sessionId) return;
    const socket = getSocket();

    const handle = (payload: { sessionId: string; question: Question }) => {
      if (payload.sessionId !== sessionId) return;
      onAdded(payload.question);
    };

    socket.on('questionAdded', handle);
    return () => {
      socket.off('questionAdded', handle);
    };
  }, [sessionId, onAdded]);
}

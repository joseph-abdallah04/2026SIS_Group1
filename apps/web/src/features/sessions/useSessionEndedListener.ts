import { useEffect } from 'react';

import { getSocket } from '../../lib/socket';

/**
 * Routes everyone to F32's final screen the moment the leader ends the
 * session.
 *
 * Lives in `SessionRouter` rather than in the waiting room and the pinboard
 * separately, because ending has to work from both and the router is the one
 * component that outlives the switch between them. It deliberately does not
 * join the session room: whichever live view is mounted has already joined it
 * (`useWaitingRoom` / `usePinboard`), and the socket is a shared singleton, so
 * a room broadcast reaches this listener too. A second `memberJoin` from here
 * would only add a duplicate presence entry to reason about.
 */
export function useSessionEndedListener(sessionId: string, onEnded: () => void) {
  useEffect(() => {
    if (!sessionId) return;
    const socket = getSocket();

    const handle = (payload: { sessionId: string; endedAt: string }) => {
      if (payload.sessionId !== sessionId) return;
      onEnded();
    };

    socket.on('sessionEnded', handle);
    return () => {
      socket.off('sessionEnded', handle);
    };
  }, [sessionId, onEnded]);
}

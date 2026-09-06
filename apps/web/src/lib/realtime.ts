import { getSocket } from './socket';
import { 
  setSessionSnapshot, 
  setShortlist, 
  setShortlistLocked, 
  setStatus 
} from './sessionStore';

export function registerRealtimeHandlers() {
  const socket = getSocket();

  socket.on('sessionState', (payload) => {
    setSessionSnapshot(payload);
  });

socket.on('shortlist_updated', (shortlist) => {
  setShortlist(shortlist);
});

  socket.on('shortlist_locked', () => {
    setShortlistLocked(true);
  });

  socket.on('voting_started', () => {
    setStatus('voting');
  });
}
import { useEffect, useState } from 'react';
import type { SessionUserPayload } from '@roundtable/shared/events';

import { getSocket } from '../../lib/socket';

/** How long a "joined" notice stays up before it fades out of the way. */
const NOTICE_MS = 4000;

interface Notice {
  id: number;
  text: string;
}

/**
 * F10: tells the people already in a live session when someone arrives late.
 *
 * The waiting room shows presence as a list, but the board has no room for
 * one — and the arrival is the part that matters mid-session, since a late
 * joiner appearing in the middle of a discussion is otherwise invisible until
 * they propose something.
 *
 * `memberJoined` is only sent to the *other* sockets in the room (the gateway
 * uses `socket.to`), so a joiner never gets a notice about themselves.
 *
 * Deliberately joins-only. `memberLeft` also fires when a socket disconnects,
 * so a participant refreshing their tab would read as "Bob left" immediately
 * followed by "Bob joined" — noise about something that did not happen.
 */
export function SessionJoinNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    const socket = getSocket();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let nextId = 0;

    const onJoined = ({ user }: { user: SessionUserPayload }) => {
      const id = nextId++;
      setNotices((prev) => [...prev, { id, text: `${user.displayName} joined` }]);

      const timer = setTimeout(() => {
        timers.delete(timer);
        setNotices((prev) => prev.filter((notice) => notice.id !== id));
      }, NOTICE_MS);
      timers.add(timer);
    };

    socket.on('memberJoined', onJoined);
    return () => {
      socket.off('memberJoined', onJoined);
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  if (notices.length === 0) return null;

  return (
    <div
      // `polite`, so a screen reader finishes what it is saying first: someone
      // else arriving never needs to interrupt what you are doing.
      aria-live="polite"
      className="pointer-events-none fixed bottom-20 right-5 z-40 flex flex-col items-end gap-1.5"
    >
      {notices.map((notice) => (
        <span
          key={notice.id}
          className="rounded-full border border-rt-tertiary bg-white px-3.5 py-1.5 text-[12px] font-medium text-rt-ink shadow-sm"
        >
          {notice.text}
        </span>
      ))}
    </div>
  );
}

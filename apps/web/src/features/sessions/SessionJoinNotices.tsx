import { useEffect, useState } from 'react';
import type { SessionUserPayload } from '@roundtable/shared/events';

import { getSocket } from '../../lib/socket';

/** How long a notice stays up before it fades out of the way. */
const NOTICE_MS = 4000;
/**
 * A refresh disconnects then reconnects. Hold a leave for this long so a
 * matching join can cancel it — otherwise every refresh reads as "left" then
 * "joined". Same window collapses a duplicate join (Strict Mode remounts
 * `memberJoin` used to fire the toast twice).
 */
const DEDUPE_MS = 1500;

interface Notice {
  id: number;
  text: string;
}

/**
 * F10: tells the people already in a live session when someone arrives or
 * leaves. The waiting room shows presence as seats around the table; the
 * board has no room for a list.
 *
 * `memberJoined` / `memberLeft` are only sent to the *other* sockets in the
 * room (the gateway uses `socket.to`), so a person never gets a notice about
 * themselves.
 */
export function SessionJoinNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    const socket = getSocket();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const pendingLeave = new Map<string, ReturnType<typeof setTimeout>>();
    const recentJoinAt = new Map<string, number>();
    let nextId = 0;

    const pushNotice = (text: string) => {
      const id = nextId++;
      setNotices((prev) => [...prev, { id, text }]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setNotices((prev) => prev.filter((notice) => notice.id !== id));
      }, NOTICE_MS);
      timers.add(timer);
    };

    const onJoined = ({ user }: { user: SessionUserPayload }) => {
      const held = pendingLeave.get(user.id);
      if (held) {
        clearTimeout(held);
        pendingLeave.delete(user.id);
        timers.delete(held);
        return;
      }
      const lastJoin = recentJoinAt.get(user.id);
      if (lastJoin !== undefined && Date.now() - lastJoin < DEDUPE_MS) return;
      recentJoinAt.set(user.id, Date.now());
      pushNotice(`${user.displayName} joined`);
    };

    const onLeft = ({ user }: { user: SessionUserPayload }) => {
      const timer = setTimeout(() => {
        pendingLeave.delete(user.id);
        timers.delete(timer);
        pushNotice(`${user.displayName} left`);
      }, DEDUPE_MS);
      pendingLeave.set(user.id, timer);
      timers.add(timer);
    };

    socket.on('memberJoined', onJoined);
    socket.on('memberLeft', onLeft);
    return () => {
      socket.off('memberJoined', onJoined);
      socket.off('memberLeft', onLeft);
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  if (notices.length === 0) return null;

  return (
    <div
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

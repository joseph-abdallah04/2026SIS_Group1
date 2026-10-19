import { useEffect, useRef } from 'react';

import { closingFades } from '../../../lib/motion';
import { CodeTiles } from '../CodeTiles';

/** How long the scene plays before the waiting room takes over. */
export const ROOM_SET_MS = 2400;

const CHAIRS = 7;

interface RoomSetMomentProps {
  title: string;
  /** The join code, flipped in under the title once the table is set. */
  code: string | null;
  /** The scene is over (or skipped): on to the waiting room. */
  onDone: () => void;
}

/**
 * The beat between "Open the room" and the waiting room: the table appears,
 * the chairs pull in round it, and the join code flips in under the session's
 * name, so the leader sees the room is set before they walk into it. With less
 * motion asked for there is no scene: straight on.
 */
export function RoomSetMoment({ title, code, onDone }: RoomSetMomentProps) {
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!closingFades()) {
      done.current();
      return;
    }
    const timer = window.setTimeout(() => done.current(), ROOM_SET_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="rt-room-set rt-setup-page fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-2 text-center">
        <div aria-hidden className="relative mb-2 size-[200px]">
          <span className="rt-room-glow absolute top-1/2 left-1/2 size-[190px] -translate-1/2 rounded-full" />
          <span className="rt-room-table absolute top-1/2 left-1/2 size-[104px] -translate-1/2 rounded-full" />
          {Array.from({ length: CHAIRS }, (_, index) => {
            // The leader's place, at the top, stays for them.
            const angle = ((-90 + ((index + 1) * 360) / (CHAIRS + 1)) * Math.PI) / 180;
            const x = Math.cos(angle);
            const y = Math.sin(angle);
            return (
              <span
                key={index}
                className="rt-room-chair absolute h-3 w-6 rounded-t-md rounded-b-[3px]"
                style={{
                  left: `${100 + x * 78 - 12}px`,
                  top: `${100 + y * 78 - 6}px`,
                  rotate: `${((index + 1) * 360) / (CHAIRS + 1)}deg`,
                  ['--rt-chair-from' as string]: `${(x * 18).toFixed(1)}px ${(y * 18).toFixed(1)}px`,
                  ['--rt-chair-index' as string]: String(index),
                }}
              />
            );
          })}
          <span className="rt-room-host absolute top-[7px] left-1/2 flex size-[30px] -translate-x-1/2 items-center justify-center rounded-full bg-rt-cool-deep text-[11px] font-semibold text-white">
            You
          </span>
        </div>
        <p
          role="status"
          className="text-[11px] font-bold tracking-[0.1em] text-rt-secondary-deep uppercase"
        >
          Your room is open
        </p>
        <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.01em] text-rt-ink">
          {title}
        </h2>
        {code ? (
          <span className="rt-room-code my-1">
            <CodeTiles code={code} />
          </span>
        ) : null}
        <p className="text-[12px] text-rt-ink-muted">
          {code ? 'People can join with this code. ' : ''}Taking you to the waiting room…
        </p>
        <span aria-hidden className="mt-1 h-1 w-[200px] overflow-hidden rounded-full bg-[#ebe3d4]">
          <span className="rt-room-bar block h-full rounded-full bg-rt-secondary" />
        </span>
        <button
          type="button"
          onClick={() => done.current()}
          className="mt-1 rounded-full px-3 py-1 text-[12.5px] font-semibold text-rt-ink-muted hover:bg-rt-ink/[0.06] hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
        >
          Go now
        </button>
      </div>
    </div>
  );
}

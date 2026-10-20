import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import type { SessionSummary } from '@roundtable/shared';

import { SessionCardActions } from '../sessions/SessionCardActions';

export function formatDay(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * A session still being set up: work to pick back up. The whole card opens
 * it straight in the editor, which can also open the room, so there is no
 * stop on the way; anyone but its leader, who cannot edit it, gets the draft
 * page instead. Delete is in its ⋯. Its title is the link, stretched over the
 * card, so the card reads as one control and the ⋯ above it is still its own
 * press.
 */
export function DraftCard({
  session,
  onChanged,
  fresh = false,
}: {
  session: SessionSummary;
  onChanged: () => void;
  /** Just saved: tinted for a moment, and brought into view, so it is easy to find. */
  fresh?: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (fresh) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [fresh]);

  return (
    <li
      ref={ref}
      className={`group relative flex min-h-36 has-[[aria-expanded=true]]:z-20 flex-col rounded-2xl border p-5 transition-[border-color,box-shadow,background-color] duration-700 hover:border-solid hover:border-rt-secondary/60 hover:shadow-[0_6px_18px_rgb(31_35_40/0.08)] focus-within:border-solid focus-within:border-rt-secondary/60 ${
        fresh
          ? 'border-solid border-rt-secondary bg-rt-secondary-wash'
          : 'border-dashed border-rt-tertiary bg-rt-surface'
      }`}
    >
      <h3 className="pr-8 text-[15px] leading-snug font-semibold text-rt-ink">
        <Link
          to={session.isLeader ? `/sessions/${session.id}/edit` : `/sessions/${session.id}`}
          className="line-clamp-2 outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-rt-secondary"
        >
          {session.title}
        </Link>
      </h3>
      <div className="mt-auto flex items-center justify-between gap-3 pt-6 text-[12.5px]">
        <span className="text-rt-ink-muted">Created {formatDay(session.createdAt)}</span>
        <span
          aria-hidden
          className="flex items-center gap-1 font-semibold text-rt-ink group-hover:underline"
        >
          {session.isLeader ? 'Continue editing' : 'Open draft'}
          <ArrowRight size={14} strokeWidth={2.2} />
        </span>
      </div>
      {session.isLeader ? (
        <SessionCardActions
          sessionId={session.id}
          title={session.title}
          status={session.status}
          onDeleted={onChanged}
          placement="absolute top-3 right-3"
        />
      ) : null}
    </li>
  );
}

/**
 * A session that has ended: one row of the history. Its title and what it
 * decided first, who led it, when, and the way to its board and recap. The
 * whole row opens it; Delete (hide it from this dashboard) is in its ⋯.
 */
export function PastSessionRow({
  session,
  onChanged,
}: {
  session: SessionSummary;
  onChanged: () => void;
}) {
  const decision = session.decision;
  return (
    <li className="group relative flex items-center has-[[aria-expanded=true]]:z-20 gap-x-4 gap-y-1.5 border-b border-rt-tertiary/60 px-3 py-3.5 transition-colors last:border-b-0 hover:bg-rt-surface-alt sm:px-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] font-semibold text-rt-ink">
          <Link
            to={`/sessions/${session.id}`}
            className="block truncate outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-rt-secondary focus-visible:after:ring-inset"
          >
            {session.title}
          </Link>
        </h3>
        {decision ? (
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-rt-ink-muted">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-rt-secondary text-white">
              <Check aria-hidden size={10} strokeWidth={3.25} />
            </span>
            <span className="sr-only">Decided: </span>
            <span className="truncate text-rt-ink">{decision.text}</span>
            {decision.more > 0 ? (
              <span className="shrink-0 text-rt-ink-faint">+{decision.more} more</span>
            ) : null}
          </p>
        ) : null}
        {/* On a narrow screen, who led it and when go under the title. */}
        <p className="mt-1 text-[12px] text-rt-ink-muted sm:hidden">
          {session.isLeader ? 'You led' : 'Member'} · {formatDay(session.createdAt)}
        </p>
      </div>
      <span
        className={`hidden shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold sm:inline ${
          session.isLeader
            ? 'bg-rt-secondary-wash text-rt-secondary-deep'
            : 'border border-rt-tertiary text-rt-ink-muted'
        }`}
      >
        {session.isLeader ? 'You led' : 'Member'}
      </span>
      <span className="hidden w-14 shrink-0 text-[12.5px] text-rt-ink-muted tabular-nums sm:inline">
        {formatDay(session.createdAt)}
      </span>
      <span
        aria-hidden
        className="hidden shrink-0 items-center gap-1 text-[12.5px] font-semibold text-rt-ink group-hover:underline md:flex"
      >
        View recap
        <ArrowRight size={14} strokeWidth={2.2} />
      </span>
      <ArrowRight aria-hidden size={16} className="shrink-0 text-rt-ink-muted md:hidden" />
      <SessionCardActions
        sessionId={session.id}
        title={session.title}
        status={session.status}
        onDeleted={onChanged}
        placement="relative"
      />
    </li>
  );
}

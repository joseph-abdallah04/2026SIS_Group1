import { Link } from 'react-router-dom';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import type { SessionDetail } from './useSessionDetail';
import { useSessionMembers } from './useSessionMembers';

function formatEndedAt(endedAt: Date | null): string | null {
  if (!endedAt) return null;
  // `endedAt` is typed `Date` but arrives as a JSON string, so it goes through
  // the constructor either way rather than calling a Date method on a string.
  return new Date(endedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * F32's final screen: where every participant lands when the leader ends the
 * session, and what an ended session shows if someone opens its URL later.
 *
 * The session is read-only from here — the server refuses proposals once
 * status is `ended` (SESSION_NOT_ACTIVE), so there is deliberately no way back
 * to the board.
 */
export function SessionEndedPage({ session }: { session: SessionDetail }) {
  const { members, loading, error } = useSessionMembers(session.id);
  const endedAt = formatEndedAt(session.endedAt);

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-primary-tint bg-rt-primary px-6 py-[13px] text-white">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Session ended</span>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">{session.title}</h1>
          <p className="mt-1 text-[13px] text-rt-ink-muted">
            {endedAt ? `Ended ${endedAt}` : 'Ended'} ·{' '}
            {session.questions.length === 1
              ? '1 question'
              : `${session.questions.length} questions`}
          </p>
        </div>

        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
            Took part {members ? `(${members.length})` : ''}
          </span>

          {loading && <p className="mt-2 text-[13px] text-rt-ink-muted">Loading participants…</p>}
          {error && !members && <p className="mt-2 text-[13px] text-red-600">{error}</p>}

          {members && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-baseline justify-between gap-3 rounded-lg border border-rt-tertiary bg-rt-surface px-3 py-2 text-[13px]"
                >
                  <span className="text-rt-ink">{member.displayName}</span>
                  {member.userId === session.leaderId && (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
                      Leader
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* The summary itself is F31. Named here rather than left blank so the
            screen reads as finished-and-waiting instead of broken. */}
        <div className="rounded-lg border border-dashed border-rt-tertiary bg-rt-surface-alt px-4 py-3">
          <p className="text-[13px] font-semibold text-rt-ink">Summary</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-rt-ink-muted">
            The auto-generated summary of what was decided will appear here once it is built.
          </p>
        </div>

        <Link
          to="/dashboard"
          className="self-start text-[13px] font-semibold text-rt-primary-deep hover:underline"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}

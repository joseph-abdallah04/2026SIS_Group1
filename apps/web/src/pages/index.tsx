// Placeholder pages — smoke-test targets (docs/05 §10). Owners replace with real UI.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { normalizeSessionCode, type SessionStatus, type SessionSummary } from '@roundtable/shared';

import { RoundTableLogo } from '../components/RoundTableLogo';
import { Button } from '../components/ui/Button';
import { DevUserSwitcher } from '../features/sessions/DevUserSwitcher';
import { useDeleteSession } from '../features/sessions/useDeleteSession';
import { useLeaveSession } from '../features/sessions/useLeaveSession';
import { useSessions } from '../features/sessions/useSessions';

/** The typed-code path to `/join/:code` — pasting a link goes straight there instead. */
function JoinByCodeForm() {
  const [code, setCode] = useState('');
  const navigate = useNavigate();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeSessionCode(code);
    if (normalized) navigate(`/join/${normalized}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Have a code? e.g. K7NP-3WQZ"
        className="min-h-10 flex-1 rounded-lg border border-rt-tertiary bg-rt-surface px-3 text-[13px] text-rt-ink outline-none focus-visible:ring-2 focus-visible:ring-rt-primary-deep"
      />
      <Button type="submit" variant="secondary">
        Join
      </Button>
    </form>
  );
}

export function LoginPage() {
  return <main className="flex h-screen items-center justify-center"><h1 className="text-2xl font-bold">Log in</h1></main>;
}

export function SignupPage() {
  return <main className="flex h-screen items-center justify-center"><h1 className="text-2xl font-bold">Sign up</h1></main>;
}

const STATUS_LABELS: Record<SessionStatus, string> = {
  draft: 'Draft',
  lobby: 'Lobby',
  active: 'Active',
  ended: 'Ended',
};

interface SessionCardProps {
  session: SessionSummary;
  /** Draft cards get Edit/Delete; live cards a non-leader is in get Leave. Ended and the leader's own live card (unreachable — redirected away) get neither. */
  variant: 'draft' | 'live' | 'ended';
  onChanged: () => void;
}

/** One dashboard row, plus F05/F07's confirm-guarded quick actions. */
function SessionCard({ session, variant, onChanged }: SessionCardProps) {
  const [confirming, setConfirming] = useState<'delete' | 'leave' | null>(null);
  const { remove, deleting, error: deleteError } = useDeleteSession();
  const { leave, leaving, error: leaveError } = useLeaveSession();

  async function handleDelete() {
    if (await remove(session.id)) onChanged();
  }

  async function handleLeave() {
    if (await leave(session.id)) onChanged();
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-rt-tertiary bg-rt-surface px-4 py-3">
      <Link
        to={`/sessions/${session.id}`}
        className="flex items-center justify-between gap-3 hover:opacity-80"
      >
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-rt-ink">{session.title}</span>
          <span className="text-[12px] text-rt-ink-faint">
            {session.code ?? 'no code yet'}
            {session.isLeader ? ' · you lead this' : ''}
          </span>
        </div>
        <span className="rounded-full bg-rt-primary-tint px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-rt-primary-deep">
          {STATUS_LABELS[session.status]}
        </span>
      </Link>

      {variant === 'draft' && (
        <div className="flex items-center gap-3 text-[12px]">
          <Link to={`/sessions/${session.id}/edit`} className="font-semibold text-rt-primary-deep hover:underline">
            Edit
          </Link>
          {confirming === 'delete' ? (
            <span className="flex items-center gap-2">
              <span className="text-rt-ink-muted">Delete this draft?</span>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="font-semibold text-red-600 hover:underline"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="text-rt-ink-muted hover:underline"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming('delete')}
              className="font-semibold text-red-600 hover:underline"
            >
              Delete
            </button>
          )}
          {deleteError && <span className="text-red-600">{deleteError}</span>}
        </div>
      )}

      {variant === 'live' && !session.isLeader && (
        <div className="flex items-center gap-3 text-[12px]">
          {confirming === 'leave' ? (
            <span className="flex items-center gap-2">
              <span className="text-rt-ink-muted">Leave this session?</span>
              <button
                type="button"
                onClick={() => void handleLeave()}
                disabled={leaving}
                className="font-semibold text-red-600 hover:underline"
              >
                {leaving ? 'Leaving…' : 'Yes, leave'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="text-rt-ink-muted hover:underline"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming('leave')}
              className="font-semibold text-red-600 hover:underline"
            >
              Leave session
            </button>
          )}
          {leaveError && <span className="text-red-600">{leaveError}</span>}
        </div>
      )}
    </li>
  );
}

interface SessionGroupProps {
  title: string;
  sessions: SessionSummary[];
  variant: 'draft' | 'live' | 'ended';
  onChanged: () => void;
}

function SessionGroup({ title, sessions, variant, onChanged }: SessionGroupProps) {
  if (sessions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
        {title} ({sessions.length})
      </span>
      <ul className="flex flex-col gap-2">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} variant={variant} onChanged={onChanged} />
        ))}
      </ul>
    </div>
  );
}

/**
 * F07: three lists by status — Draft, Lobby+Active, Ended (decision logged on
 * KAN-33) — plus the leader hard-lock: a leader whose own session is
 * lobby/active is redirected straight there, before this page ever renders
 * its content, because for them there is no dashboard to browse while that
 * session is live (the only way out is ending it — F32/KAN-54, not built
 * yet). Members are never redirected; leaving a lobby/active session they're
 * in (not leading) is the explicit "Leave session" action on its card.
 */
export function DashboardPage() {
  const { sessions, loading, error, reload } = useSessions();
  const navigate = useNavigate();

  const lockedInSession = sessions?.find(
    (s) => s.isLeader && (s.status === 'lobby' || s.status === 'active'),
  );

  useEffect(() => {
    if (lockedInSession) navigate(`/sessions/${lockedInSession.id}`, { replace: true });
  }, [lockedInSession, navigate]);

  const draftSessions = sessions?.filter((s) => s.status === 'draft') ?? [];
  const liveSessions = sessions?.filter((s) => s.status === 'lobby' || s.status === 'active') ?? [];
  const endedSessions = sessions?.filter((s) => s.status === 'ended') ?? [];

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-primary-tint bg-rt-primary px-6 py-[13px] text-white">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Dashboard</span>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-6 py-8">
        <DevUserSwitcher />

        <div className="flex items-center justify-between">
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">My sessions</h1>
          <Link to="/sessions/new">
            <Button type="button">+ Create session</Button>
          </Link>
        </div>

        <JoinByCodeForm />

        {loading && <p className="text-[13px] text-rt-ink-muted">Loading sessions…</p>}

        {lockedInSession && (
          <p className="text-[13px] text-rt-ink-muted">
            Taking you back to your live session…
          </p>
        )}

        {error && (
          <div className="rounded-lg border border-rt-tertiary bg-rt-surface-alt p-4 text-[13px]">
            <p className="text-rt-ink-muted">{error}</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-2 font-semibold text-rt-primary-deep hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {sessions && sessions.length === 0 && (
          <p className="text-[13px] text-rt-ink-muted">
            No sessions yet — create one to get started.
          </p>
        )}

        {sessions && !lockedInSession && sessions.length > 0 && (
          <div className="flex flex-col gap-6">
            <SessionGroup title="Draft" sessions={draftSessions} variant="draft" onChanged={reload} />
            <SessionGroup title="Lobby & active" sessions={liveSessions} variant="live" onChanged={reload} />
            <SessionGroup title="Ended" sessions={endedSessions} variant="ended" onChanged={reload} />
          </div>
        )}
      </div>
    </main>
  );
}

export function SessionPage() {
  return <main className="flex h-screen items-center justify-center"><h1 className="text-2xl font-bold">Session</h1></main>;
}

export function SettingsPage() {
  return <main className="flex h-screen items-center justify-center"><h1 className="text-2xl font-bold">Settings</h1></main>;
}

export function NotFoundPage() {
  return <main className="flex h-screen items-center justify-center"><h1 className="text-2xl font-bold">404</h1></main>;
}

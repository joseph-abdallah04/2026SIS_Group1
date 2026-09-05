import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { normalizeSessionCode, type SessionStatus, type SessionSummary } from '@roundtable/shared';

import { RoundTableLogo } from '../components/RoundTableLogo';
import { Button } from '../components/ui/Button';
import { logout } from '../features/auth/api';
import { useDeleteSession } from '../features/sessions/useDeleteSession';
import { useSessions } from '../features/sessions/useSessions';
import { clearToken } from '../lib/auth';
import { disconnectSocket } from '../lib/socket';

// F01/F02 own these two screens; the dashboard below re-exports them so
// `App.tsx` keeps importing every page from one barrel.
export { LoginPage } from '../features/auth/LoginPage';
export { SignupPage } from '../features/auth/SignupPage';

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

const STATUS_LABELS: Record<SessionStatus, string> = {
  draft: 'Draft',
  lobby: 'Lobby',
  active: 'Active',
  ended: 'Ended',
};

interface SessionCardProps {
  session: SessionSummary;
  /** Drafts get F05's Edit/Delete; an ended session is display-only. */
  isDraft: boolean;
  onChanged: () => void;
}

/** One dashboard row, plus F05's confirm-guarded edit/delete on drafts. */
function SessionCard({ session, isDraft, onChanged }: SessionCardProps) {
  const [confirming, setConfirming] = useState(false);
  const { remove, deleting, error: deleteError } = useDeleteSession();

  async function handleDelete() {
    if (await remove(session.id)) onChanged();
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

      {isDraft && (
        <div className="flex items-center gap-3 text-[12px]">
          <Link
            to={`/sessions/${session.id}/edit`}
            className="font-semibold text-rt-primary-deep hover:underline"
          >
            Edit
          </Link>
          {confirming ? (
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
                onClick={() => setConfirming(false)}
                className="text-rt-ink-muted hover:underline"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="font-semibold text-red-600 hover:underline"
            >
              Delete
            </button>
          )}
          {deleteError && <span className="text-red-600">{deleteError}</span>}
        </div>
      )}
    </li>
  );
}

interface SessionGroupProps {
  title: string;
  sessions: SessionSummary[];
  isDraft: boolean;
  onChanged: () => void;
}

function SessionGroup({ title, sessions, isDraft, onChanged }: SessionGroupProps) {
  if (sessions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
        {title} ({sessions.length})
      </span>
      <ul className="flex flex-col gap-2">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} isDraft={isDraft} onChanged={onChanged} />
        ))}
      </ul>
    </div>
  );
}

/**
 * F07, with the one-live-session-at-a-time rule (KAN-33 decisions): being in
 * a lobby/active session means you are *in* it, so anyone with a live
 * membership — leader or member — is redirected straight back into it rather
 * than being allowed to browse from here. Leaving is an action on the
 * waiting room / pinboard, not a dashboard button; once they leave, this
 * page is reachable again and they can join another or start their own.
 *
 * That is why only Draft and Ended render below: a live session is never
 * visible from this page, because reaching this page at all means there
 * isn't one.
 */
export function DashboardPage() {
  const { sessions, loading, error, reload } = useSessions();
  const navigate = useNavigate();

  // `isCurrentMember` matters: a session they left still appears here as
  // history, and without that check the redirect would haul them straight
  // back into the session they just walked out of.
  const liveSession = sessions?.find(
    (s) => (s.status === 'lobby' || s.status === 'active') && s.isCurrentMember,
  );

  useEffect(() => {
    if (liveSession) navigate(`/sessions/${liveSession.id}`, { replace: true });
  }, [liveSession, navigate]);

  const draftSessions = sessions?.filter((s) => s.status === 'draft') ?? [];
  const endedSessions = sessions?.filter((s) => s.status === 'ended') ?? [];

  // Clears the token even if the request fails: the token is stateless, so the
  // client dropping it *is* the logout (see auth's `/logout` route) — a network
  // error must not leave someone stuck logged in.
  async function onLogout() {
    try {
      await logout();
    } finally {
      disconnectSocket();
      clearToken();
      navigate('/login', { replace: true });
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-primary-tint bg-rt-primary px-6 py-[13px] text-white">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Dashboard</span>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="ml-auto text-[12px] font-semibold text-white/80 hover:text-white hover:underline"
        >
          Log out
        </button>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">My sessions</h1>
          <Link to="/sessions/new">
            <Button type="button">+ Create session</Button>
          </Link>
        </div>

        <JoinByCodeForm />

        {loading && <p className="text-[13px] text-rt-ink-muted">Loading sessions…</p>}

        {liveSession && (
          <p className="text-[13px] text-rt-ink-muted">Taking you back to your live session…</p>
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

        {sessions && !liveSession && sessions.length > 0 && (
          <div className="flex flex-col gap-6">
            <SessionGroup title="Draft" sessions={draftSessions} isDraft onChanged={reload} />
            <SessionGroup
              title="Ended"
              sessions={endedSessions}
              isDraft={false}
              onChanged={reload}
            />
          </div>
        )}
      </div>
    </main>
  );
}

export function SessionPage() {
  return (
    <main className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Session</h1>
    </main>
  );
}

export function SettingsPage() {
  return (
    <main className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Settings</h1>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">404</h1>
    </main>
  );
}

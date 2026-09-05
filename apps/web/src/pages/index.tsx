import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { type SessionStatus, type SessionSummary } from '@roundtable/shared';

import { RoundTableLogo } from '../components/RoundTableLogo';
import { Button } from '../components/ui/Button';
import { logout } from '../features/auth/api';
import { JoinByCodeForm } from '../features/sessions/JoinByCodeForm';
import { SessionCardActions } from '../features/sessions/SessionCardActions';
import { useSessions } from '../features/sessions/useSessions';
import { clearToken } from '../lib/auth';
import { disconnectSocket } from '../lib/socket';

// F01/F02 own these two screens; the dashboard below re-exports them so
// `App.tsx` keeps importing every page from one barrel.
export { LoginPage } from '../features/auth/LoginPage';
export { SignupPage } from '../features/auth/SignupPage';

const STATUS_LABELS: Record<SessionStatus, string> = {
  draft: 'Draft',
  lobby: 'Lobby',
  active: 'Active',
  ended: 'Ended',
};

const PREVIEW_NOTES = [
  { top: '16%', left: '12%', rotate: '-7deg', color: '#FDF4E5' },
  { top: '22%', left: '52%', rotate: '5deg', color: '#F9EEF2' },
  { top: '54%', left: '18%', rotate: '4deg', color: '#EEF2F4' },
  { top: '58%', left: '56%', rotate: '-4deg', color: '#EEF4F0' },
] as const;

function noteCountForStatus(status: SessionStatus): number {
  switch (status) {
    case 'draft':
      return 1;
    case 'lobby':
      return 2;
    case 'active':
      return 3;
    case 'ended':
      return 4;
  }
}

/** Stable 0–3 offset so two sessions of the same status don't look identical. */
function previewShift(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i)) % 4;
  return n;
}

function formatCreated(createdAt: Date | string): string {
  return new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * A tiny pinboard stand-in. We do not snapshot real boards (that would mean
 * fetching every session's proposals just to paint the dashboard), so the
 * number of notes follows status: empty-ish for a draft, fuller once it has
 * been run.
 */
function SessionPreview({ session }: { session: SessionSummary }) {
  const count = noteCountForStatus(session.status);
  const shift = previewShift(session.id);
  const notes = [...PREVIEW_NOTES.slice(shift), ...PREVIEW_NOTES.slice(0, shift)].slice(0, count);

  return (
    <div
      className="relative aspect-[4/3] overflow-hidden rounded-xl bg-rt-surface-alt"
      style={{
        backgroundImage: 'radial-gradient(rgba(8,12,21,0.10) 1px, transparent 1px)',
        backgroundSize: '14px 14px',
      }}
      aria-hidden
    >
      {notes.map((note, index) => (
        <span
          key={index}
          className="absolute h-10 w-10 rounded-sm shadow-sm sm:h-11 sm:w-11"
          style={{
            top: note.top,
            left: note.left,
            background: note.color,
            transform: `rotate(${note.rotate})`,
          }}
        />
      ))}
      <span className="absolute right-2 bottom-2 rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-rt-primary-deep uppercase shadow-sm">
        {STATUS_LABELS[session.status]}
      </span>
    </div>
  );
}

interface SessionCardProps {
  session: SessionSummary;
  onChanged: () => void;
}

/** One dashboard tile. Leader actions sit on the thumbnail, not under the title. */
function SessionCard({ session, onChanged }: SessionCardProps) {
  return (
    <li className="flex flex-col gap-2">
      <div className="group relative has-[[aria-expanded=true]]:z-20">
        <Link to={`/sessions/${session.id}`} className="block">
          <SessionPreview session={session} />
        </Link>
        {(session.isLeader || session.status === 'ended') && (
          <SessionCardActions
            sessionId={session.id}
            title={session.title}
            status={session.status}
            onDeleted={onChanged}
          />
        )}
      </div>
      <Link to={`/sessions/${session.id}`} className="group flex flex-col gap-2">
        <span className="truncate text-[13px] font-semibold text-rt-ink group-hover:underline">
          {session.title}
        </span>
        <span className="truncate text-[12px] text-rt-ink-faint">
          {session.code ?? 'no code yet'}
          {session.isLeader ? ' · you lead this' : ''}
          {' · '}
          {formatCreated(session.createdAt)}
        </span>
      </Link>
    </li>
  );
}

interface SessionGroupProps {
  title: string;
  sessions: SessionSummary[];
  onChanged: () => void;
}

function SessionGroup({ title, sessions, onChanged }: SessionGroupProps) {
  if (sessions.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
        {title} ({sessions.length})
      </span>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} onChanged={onChanged} />
        ))}
      </ul>
    </div>
  );
}

function matchesTitle(session: SessionSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return session.title.toLowerCase().includes(needle);
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
  const [titleQuery, setTitleQuery] = useState('');

  // `isCurrentMember` matters: a session they left still appears here as
  // history, and without that check the redirect would haul them straight
  // back into the session they just walked out of.
  const liveSession = sessions?.find(
    (s) => (s.status === 'lobby' || s.status === 'active') && s.isCurrentMember,
  );

  useEffect(() => {
    if (liveSession) navigate(`/sessions/${liveSession.id}`, { replace: true });
  }, [liveSession, navigate]);

  const visibleSessions = useMemo(
    () => (sessions ?? []).filter((session) => matchesTitle(session, titleQuery)),
    [sessions, titleQuery],
  );
  const draftSessions = visibleSessions.filter((s) => s.status === 'draft');
  const endedSessions = visibleSessions.filter((s) => s.status === 'ended');
  const searchActive = titleQuery.trim().length > 0;

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
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-secondary/40 bg-rt-primary px-6 py-[13px] text-rt-ink">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Dashboard</span>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="ml-auto text-[12px] font-semibold text-rt-ink/70 hover:text-rt-ink hover:underline"
        >
          Log out
        </button>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">My sessions</h1>
          <Link to="/sessions/new">
            <Button type="button">+ Create session</Button>
          </Link>
        </div>

        <JoinByCodeForm />

        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-rt-tertiary bg-rt-surface px-3">
          <Search aria-hidden size={16} className="shrink-0 text-rt-ink-faint" />
          <span className="sr-only">Search sessions by title</span>
          <input
            type="search"
            value={titleQuery}
            onChange={(e) => setTitleQuery(e.target.value)}
            placeholder="Search by title"
            className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-rt-ink outline-none placeholder:text-rt-ink-faint"
          />
        </label>

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

        {sessions &&
          !liveSession &&
          sessions.length > 0 &&
          searchActive &&
          visibleSessions.length === 0 && (
            <p className="text-[13px] text-rt-ink-muted">
              No sessions match “{titleQuery.trim()}”.
            </p>
          )}

        {sessions && !liveSession && visibleSessions.length > 0 && (
          <div className="flex flex-col gap-8">
            <SessionGroup title="Draft" sessions={draftSessions} onChanged={reload} />
            <SessionGroup title="Ended" sessions={endedSessions} onChanged={reload} />
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

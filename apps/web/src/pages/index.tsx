// Placeholder pages — smoke-test targets (docs/05 §10). Owners replace with real UI.
import { Link } from 'react-router-dom';
import type { SessionStatus } from '@roundtable/shared';

import { RoundTableLogo } from '../components/RoundTableLogo';
import { Button } from '../components/ui/Button';
import { DevUserSwitcher } from '../features/sessions/DevUserSwitcher';
import { useSessions } from '../features/sessions/useSessions';

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

/**
 * F04's acceptance criterion is "sees it appear on their dashboard" — this is
 * that minimal list (title, status, code, link). The full dashboard (KAN-33 /
 * F07 — filters, richer cards, etc.) is a separate, later ticket.
 */
export function DashboardPage() {
  const { sessions, loading, error, reload } = useSessions();

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

        {loading && <p className="text-[13px] text-rt-ink-muted">Loading sessions…</p>}

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

        {sessions && sessions.length > 0 && (
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  to={`/sessions/${session.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-rt-tertiary bg-rt-surface px-4 py-3 hover:bg-rt-primary-tint"
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
              </li>
            ))}
          </ul>
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

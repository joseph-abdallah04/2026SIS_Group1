import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import type { Session } from '@roundtable/shared';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { Button } from '../../components/ui/Button';
import { api, ApiClientError } from '../../lib/api';
import { useCurrentUserId } from '../../lib/currentUser';
import type { SessionDetail } from './useSessionDetail';

interface SessionDraftPageProps {
  session: SessionDetail;
  /** Tells `SessionRouter` to refetch — once the session is lobby it switches to the waiting room. */
  onOpened: () => void;
}

/**
 * F04's setup screen plus F06's "open for joining" action. Opening jumps
 * straight to the waiting room (via `onOpened`); the join code and link live
 * there, next to the people who are arriving.
 */
export function SessionDraftPage({ session, onOpened }: SessionDraftPageProps) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLeader = session.leaderId === useCurrentUserId();

  async function handleOpen() {
    setOpening(true);
    setError(null);
    try {
      await api.post<Session>(`/api/sessions/${session.id}/open`, {});
      onOpened();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to open the session');
      setOpening(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-secondary/40 bg-rt-primary px-6 py-[13px] text-rt-ink">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Session setup</span>
        <Link
          to="/dashboard"
          className="ml-auto text-[12px] font-semibold text-rt-ink/70 hover:text-rt-ink hover:underline"
        >
          Dashboard
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">{session.title}</h1>
          <p className="mt-1 text-[13px] text-rt-ink-muted">Draft — not joinable yet</p>
        </div>

        <ol className="flex flex-col gap-2">
          {session.questions.map((question, index) => (
            <li
              key={question.id}
              className="flex items-baseline gap-2 rounded-lg border border-rt-tertiary bg-rt-surface px-3 py-2 text-[13px]"
            >
              <span className="font-semibold text-rt-ink-faint">{index + 1}.</span>
              <span className="text-rt-ink">{question.text}</span>
            </li>
          ))}
        </ol>

        {!isLeader && (
          <>
            <p className="text-[13px] text-rt-ink-muted">
              Only the session leader can open this for joining.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/dashboard')}
              className="self-start"
            >
              Back to dashboard
            </Button>
          </>
        )}

        {isLeader && (
          <>
            {error && <p className="text-[13px] text-red-600">{error}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={() => void handleOpen()} disabled={opening}>
                {opening ? 'Opening…' : 'Open for joining'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => navigate('/dashboard')}>
                Back to dashboard
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

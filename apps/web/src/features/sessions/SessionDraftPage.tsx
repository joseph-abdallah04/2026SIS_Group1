import { DoorOpen, Pencil } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { Session } from '@roundtable/shared';

import { api, ApiClientError } from '../../lib/api';
import { useCurrentUserId } from '../../lib/currentUser';
import type { DraftPageState } from './CreateSessionPage';
import { LobbyAgenda } from './LobbyAgenda';
import { FactLine } from './setup/FactLine';
import { RoomSetMoment } from './setup/RoomSetMoment';
import { sessionFacts } from './setup/setupSummary';
import { SetupHeader } from './setup/SetupHeader';
import type { SessionDetail } from './useSessionDetail';

interface SessionDraftPageProps {
  session: SessionDetail;
  /** Tells `SessionRouter` to refetch — once the session is lobby it switches to the waiting room. */
  onOpened: () => void;
}

/**
 * A saved draft (F04), and F06's "open for joining": the setup pages' look,
 * with the questions as the lobby will show them. Opening plays the "room
 * set" moment, then the waiting room takes over (via `onOpened`); the join
 * code and link live there, next to the people who are arriving. Edit goes
 * back to the form (F05), so a typo is one click away rather than via the
 * dashboard.
 */
export function SessionDraftPage({ session, onOpened }: SessionDraftPageProps) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  // Opened: its code, while the moment plays.
  const [opened, setOpened] = useState<{ code: string | null } | null>(null);
  // Arriving from "Open the room" when the draft was made but would not open.
  const location = useLocation();
  const arrival = location.state as DraftPageState | null;
  const [error, setError] = useState<string | null>(arrival?.openError ?? null);
  // Said once. History keeps a location's state through a reload and Back, so
  // left there, a failure long since dealt with would be reported again.
  const arrivedWithError = Boolean(arrival?.openError);
  useEffect(() => {
    if (arrivedWithError) navigate(location.pathname, { replace: true, state: null });
  }, [arrivedWithError, navigate, location.pathname]);

  const isLeader = session.leaderId === useCurrentUserId();

  async function handleOpen() {
    setOpening(true);
    setError(null);
    try {
      const open = await api.post<Session>(`/api/sessions/${session.id}/open`, {});
      setOpened({ code: open.code });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to open the session');
      setOpening(false);
    }
  }

  return (
    <main className="rt-setup-page flex h-dvh flex-col overflow-hidden text-rt-ink">
      <SetupHeader
        current="Draft"
        status="Not joinable yet"
        onDashboard={() => navigate('/dashboard')}
      />

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[700px] flex-col gap-4 px-4 pt-6 pb-10 sm:px-6 sm:pt-7">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-[0.1em] text-rt-secondary-deep uppercase">
              Draft session
            </span>
            <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">
              {session.title}
            </h1>
            <FactLine facts={[...sessionFacts(session), 'Not joinable until it is opened']} />
          </div>

          <LobbyAgenda
            questions={session.questions}
            discussionTimerSeconds={session.discussionTimerSeconds}
            votingTimerSeconds={session.votingTimerSeconds}
          />

          {!isLeader && (
            <p className="text-[13px] text-rt-ink-muted">
              Only the session leader can open this for joining.
            </p>
          )}

          {isLeader && (
            <div className="flex flex-col gap-3">
              {error && (
                <p role="alert" className="text-[13px] text-red-700">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => void handleOpen()}
                  disabled={opening}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-rt-secondary px-[18px] text-[13.5px] font-semibold text-rt-ink shadow-[0_1px_0_rgba(122,106,76,0.25),0_6px_16px_rgba(224,163,60,0.28)] transition-colors hover:enabled:bg-rt-secondary-deep hover:enabled:text-white focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <DoorOpen aria-hidden size={16} />
                  {opening ? 'Opening…' : 'Open the room'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/sessions/${session.id}/edit`)}
                  disabled={opening}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-rt-tertiary bg-white px-[18px] text-[13.5px] font-semibold text-rt-ink hover:enabled:bg-[#f6f2ea] focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Pencil aria-hidden size={14} />
                  Edit
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {opened ? <RoomSetMoment title={session.title} code={opened.code} onDone={onOpened} /> : null}
    </main>
  );
}

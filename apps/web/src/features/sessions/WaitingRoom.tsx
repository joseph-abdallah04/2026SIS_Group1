import { CopyField } from '../../components/ui/CopyField';
import { RoundTableLogo } from '../../components/RoundTableLogo';
import { useCurrentUserId } from '../../lib/currentUser';
import type { SessionDetail } from './useSessionDetail';
import { EndSessionControl } from './EndSessionControl';
import { LeaveSessionControl } from './LeaveSessionControl';
import { useStartSession } from './useStartSession';
import { useWaitingRoom } from './useWaitingRoom';
import { WaitingRoomTable } from './WaitingRoomTable';

interface WaitingRoomProps {
  session: SessionDetail;
  /** `SessionRouter`'s `reload` — called on the `sessionStarted` broadcast so
   * every connected client (leader included) re-fetches and switches to the
   * pinboard once `status` comes back `active` (F09). */
  onStarted: () => void;
}

/**
 * F08's live lobby: people sit around the table. Session details live in
 * a card on the left, questions on the right, and start/wait sits in the
 * middle of the tabletop.
 */
export function WaitingRoom({ session, onStarted }: WaitingRoomProps) {
  const { participants, loading, error, isLive } = useWaitingRoom(session.id, onStarted);
  const { start, starting, error: startError } = useStartSession(session.id);
  const isLeader = session.leaderId === useCurrentUserId();
  const joinLink = session.code ? `${window.location.origin}/join/${session.code}` : null;

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f7f4ee] text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-secondary/40 bg-rt-primary px-6 py-[13px] text-rt-ink">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Waiting room</span>
        <div className="ml-auto">
          {isLeader ? (
            <EndSessionControl sessionId={session.id} />
          ) : (
            <LeaveSessionControl sessionId={session.id} />
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="flex max-h-[40%] min-h-0 w-full shrink-0 items-center overflow-y-auto px-5 py-5 lg:max-h-none lg:w-[22rem]">
          <div className="rt-lobby-panel flex flex-col gap-4">
            <div>
              <h1 className="text-[19px] font-semibold tracking-[-0.01em]">{session.title}</h1>
              <p className="mt-1 text-[13px] text-rt-ink-muted">
                {!isLive
                  ? 'Connecting…'
                  : isLeader
                    ? 'Share either of these, then start from the table when everyone’s here.'
                    : 'You’re in. Share either of these if someone still needs a seat.'}
              </p>
            </div>

            {session.code && joinLink && (
              <div className="flex flex-col gap-4">
                <CopyField label="Code" value={session.code} />
                <CopyField label="Link" value={joinLink} />
              </div>
            )}

            {loading && <p className="text-[13px] text-rt-ink-muted">Loading participants…</p>}
            {error && !participants && <p className="text-[13px] text-red-600">{error}</p>}
          </div>
        </aside>

        <WaitingRoomTable participants={participants} leaderId={session.leaderId}>
          {isLeader ? (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                className="rt-waiting-start"
                onClick={() => void start()}
                disabled={starting}
              >
                {starting ? 'Starting…' : 'Start session'}
              </button>
              {startError && <p className="text-[12px] text-red-600">{startError}</p>}
            </div>
          ) : (
            <p className="rt-waiting-wait">The table’s set. Waiting on the leader to kick things off.</p>
          )}
        </WaitingRoomTable>

        <aside className="flex max-h-[32%] min-h-0 w-full shrink-0 items-center overflow-y-auto px-5 py-5 lg:max-h-none lg:w-[20rem]">
          <div className="rt-lobby-panel">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
              Questions ({session.questions.length})
            </span>
            <ol className="mt-3 flex flex-col gap-2">
              {session.questions.map((question, index) => (
                <li
                  key={question.id}
                  className="flex items-baseline gap-2 rounded-lg border border-rt-primary/35 bg-rt-primary/20 px-3 py-2 text-[13px]"
                >
                  <span className="font-semibold text-rt-ink-faint">{index + 1}.</span>
                  <span className="text-rt-ink">{question.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </main>
  );
}

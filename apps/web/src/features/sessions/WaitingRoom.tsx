import { RoundTableLogo } from '../../components/RoundTableLogo';
import { Button } from '../../components/ui/Button';
import { getDevUserId } from '../../lib/api';
import type { SessionDetail } from './useSessionDetail';
import { LeaveSessionControl } from './LeaveSessionControl';
import { useStartSession } from './useStartSession';
import { useWaitingRoom } from './useWaitingRoom';

interface WaitingRoomProps {
  session: SessionDetail;
  /** `SessionRouter`'s `reload` — called on the `sessionStarted` broadcast so
   * every connected client (leader included) re-fetches and switches to the
   * pinboard once `status` comes back `active` (F09). */
  onStarted: () => void;
}

/**
 * F08's live lobby: connected participants over the socket, a question
 * preview, and — for the leader — the F09 "Start session" action that flips
 * `status` to `active` and, via `onStarted`, moves everyone here into the
 * session view at once.
 */
export function WaitingRoom({ session, onStarted }: WaitingRoomProps) {
  const { participants, loading, error, isLive } = useWaitingRoom(session.id, onStarted);
  const { start, starting, error: startError } = useStartSession(session.id);
  const isLeader = session.leaderId === getDevUserId();

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-primary-tint bg-rt-primary px-6 py-[13px] text-white">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Waiting room</span>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">{session.title}</h1>
          <p className="mt-1 text-[13px] text-rt-ink-muted">
            {session.code ? `Code: ${session.code}` : 'Open — waiting for a code'}
            {isLive ? ' · connected' : ' · connecting…'}
          </p>
        </div>

        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
            Questions ({session.questions.length})
          </span>
          <ol className="mt-2 flex flex-col gap-2">
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
        </div>

        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
            Here now {participants ? `(${participants.length})` : ''}
          </span>

          {loading && <p className="mt-2 text-[13px] text-rt-ink-muted">Loading participants…</p>}
          {error && !participants && <p className="mt-2 text-[13px] text-red-600">{error}</p>}

          {participants && participants.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {participants.map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg border border-rt-tertiary bg-rt-surface px-3 py-2 text-[13px] text-rt-ink"
                >
                  {p.displayName}
                </li>
              ))}
            </ul>
          )}

          {participants && participants.length === 0 && (
            <p className="mt-2 text-[13px] text-rt-ink-muted">Nobody else is here yet.</p>
          )}
        </div>

        {isLeader && (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => void start()}
              disabled={starting}
              className="self-start"
            >
              {starting ? 'Starting…' : 'Start session'}
            </Button>
            {startError && <p className="text-[13px] text-red-600">{startError}</p>}
          </div>
        )}

        {!isLeader && <LeaveSessionControl sessionId={session.id} />}
      </div>
    </main>
  );
}

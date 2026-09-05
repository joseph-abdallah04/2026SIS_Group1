import { CopyField } from '../../components/ui/CopyField';
import { RoundTableLogo } from '../../components/RoundTableLogo';
import { Button } from '../../components/ui/Button';
import { useCurrentUserId } from '../../lib/currentUser';
import type { SessionDetail } from './useSessionDetail';
import { EndSessionControl } from './EndSessionControl';
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
 * preview, the shareable code/link, and — for the leader — the F09 "Start
 * session" action that flips `status` to `active`.
 */
export function WaitingRoom({ session, onStarted }: WaitingRoomProps) {
  const { participants, loading, error, isLive } = useWaitingRoom(session.id, onStarted);
  const { start, starting, error: startError } = useStartSession(session.id);
  const isLeader = session.leaderId === useCurrentUserId();
  const joinLink = session.code ? `${window.location.origin}/join/${session.code}` : null;

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
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

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">{session.title}</h1>
          <p className="mt-1 text-[13px] text-rt-ink-muted">
            {!isLive
              ? 'Connecting…'
              : isLeader
                ? 'Connected — start the session when everyone is here'
                : 'Connected — waiting for the leader to start'}
          </p>
        </div>

        {session.code && joinLink && (
          <div className="flex flex-col gap-4 rounded-lg border border-rt-tertiary bg-rt-surface-alt p-4">
            <p className="text-[13px] text-rt-ink">
              Session is open. Share either of these so others can join.
            </p>
            <CopyField label="Code" value={session.code} />
            <CopyField label="Link" value={joinLink} />
          </div>
        )}

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
      </div>
    </main>
  );
}

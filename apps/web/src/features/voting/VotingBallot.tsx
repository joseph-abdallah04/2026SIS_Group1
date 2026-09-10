import type { BoardItem, VotingTally, VotingVoterStatus } from '@roundtable/shared';

import { ProposalCard } from '../pinboard/ProposalCard';
import { initialsFromName, swatchForId } from '../sessions/waitingRoomSeats';

interface VotingBallotProps {
  questionText: string | null;
  items: BoardItem[];
  tallies: VotingTally[];
  myVote: string | null;
  votedCount: number;
  voterCount: number;
  isLeader: boolean;
  viewerId: string | null;
  leaderId: string;
  voterStatuses: VotingVoterStatus[] | null;
  busy: boolean;
  error: string | null;
  onVote: (proposalId: string) => void;
  onClose: () => void;
}

function tallyFor(tallies: VotingTally[], proposalId: string): VotingTally {
  return (
    tallies.find((row) => row.proposalId === proposalId) ?? { proposalId, votes: 0, percent: 0 }
  );
}

function VoterRow({ person }: { person: VotingVoterStatus }) {
  const swatch = swatchForId(person.userId);
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
        style={{ background: swatch.background, color: swatch.color }}
      >
        {initialsFromName(person.displayName)}
      </span>
      <span className="min-w-0 truncate text-[12.5px] text-rt-ink">{person.displayName}</span>
    </li>
  );
}

function LeaderVoterRoster({ statuses }: { statuses: VotingVoterStatus[] }) {
  const waiting = statuses.filter((row) => !row.hasVoted);
  const voted = statuses.filter((row) => row.hasVoted);

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-4 overflow-y-auto border-l border-rt-tertiary bg-rt-surface-alt px-4 py-4">
      <div>
        <p className="text-[10px] font-semibold tracking-[0.14em] text-rt-ink-faint uppercase">
          Still to vote
        </p>
        {waiting.length === 0 ? (
          <p className="mt-2 text-[12px] text-rt-ink-muted">Everyone has voted</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {waiting.map((person) => (
              <VoterRow key={person.userId} person={person} />
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-[10px] font-semibold tracking-[0.14em] text-rt-ink-faint uppercase">
          Voted
        </p>
        {voted.length === 0 ? (
          <p className="mt-2 text-[12px] text-rt-ink-muted">No votes yet</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {voted.map((person) => (
              <VoterRow key={person.userId} person={person} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

/**
 * F28 ballot: a non-dismissible overlay that stays up until the leader ends
 * the round. Everyone picks one proposal; live percentages are of votes already
 * cast, not of who voted for what.
 */
export function VotingBallot({
  questionText,
  items,
  tallies,
  myVote,
  votedCount,
  voterCount,
  isLeader,
  viewerId,
  leaderId,
  voterStatuses,
  busy,
  error,
  onVote,
  onClose,
}: VotingBallotProps) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-stretch justify-center bg-rt-ink/45 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="voting-ballot-title"
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-rt-tertiary bg-rt-surface shadow-lg"
      >
        <header className="shrink-0 border-b border-rt-tertiary px-5 py-4">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-rt-ink-faint uppercase">
            Voting
          </p>
          <h2
            id="voting-ballot-title"
            className="mt-1 text-[18px] font-semibold tracking-[-0.01em] text-rt-ink"
          >
            {questionText ? `“${questionText}”` : 'Choose one proposal'}
          </h2>
          <p className="mt-1 text-[13px] text-rt-ink-muted">
            Select one proposal. You can change your mind until the leader ends the vote. Votes are
            anonymous.
          </p>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-4">
            {items.length === 0 ? (
              <p className="text-[13px] text-rt-ink-muted">No proposals on this ballot.</p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
                {items.map((item) => {
                  const tally = tallyFor(tallies, item.id);
                  const selected = myVote === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onVote(item.id)}
                        disabled={busy}
                        aria-pressed={selected}
                        className={`w-full rounded-xl text-left transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-70 ${
                          selected
                            ? 'ring-2 ring-rt-secondary ring-offset-2'
                            : 'hover:ring-1 hover:ring-rt-secondary/40'
                        }`}
                      >
                        <ProposalCard
                          item={item}
                          isOwnedByViewer={viewerId !== null && item.authorId === viewerId}
                          isAuthorLeader={item.authorId === leaderId}
                          isShortlisted={selected}
                        />
                      </button>
                      <div className="mt-2 px-0.5">
                        <div className="h-1.5 overflow-hidden rounded-full bg-rt-tertiary/60">
                          <div
                            className="h-full rounded-full bg-rt-secondary"
                            style={{ width: `${tally.percent}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] font-medium text-rt-ink-muted">
                          {`${tally.percent}% · ${tally.votes} ${tally.votes === 1 ? 'vote' : 'votes'}`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {isLeader && voterStatuses ? <LeaderVoterRoster statuses={voterStatuses} /> : null}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-rt-tertiary px-5 py-3">
          <p className="text-[13px] font-medium text-rt-ink">
            {voterCount === 0
              ? 'No one is in the session to vote'
              : `${votedCount} of ${voterCount} voted`}
          </p>
          {myVote ? (
            <span className="text-[12px] text-rt-ink-muted">Your vote is in</span>
          ) : (
            <span className="text-[12px] text-rt-ink-muted">You haven’t voted yet</span>
          )}
          {error ? <span className="text-[12px] text-red-600">{error}</span> : null}
          <div className="ml-auto">
            {isLeader ? (
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-full bg-rt-secondary px-4 py-2 text-[13px] font-semibold text-rt-ink hover:bg-rt-secondary-deep hover:text-white disabled:opacity-60"
              >
                {busy ? 'Closing…' : 'End voting'}
              </button>
            ) : (
              <span className="text-[12px] text-rt-ink-muted">
                Waiting for the leader to end the vote
              </span>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

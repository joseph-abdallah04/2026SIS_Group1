import type { BoardItem, VotingPhase, VotingTally, VotingVoterStatus } from '@roundtable/shared';

import { ProposalCard } from '../pinboard/ProposalCard';
import { initialsFromName, swatchForId } from '../sessions/waitingRoomSeats';
import { VoteResultBadge, voteResultRing } from './VoteResultBadge';

interface VotingBallotProps {
  questionText: string | null;
  items: BoardItem[];
  tallies: VotingTally[];
  myVote: string | null;
  votedCount: number;
  voterCount: number;
  phase: Extract<VotingPhase, 'open' | 'closed'>;
  isLeader: boolean;
  viewerId: string | null;
  leaderId: string;
  voterStatuses: VotingVoterStatus[] | null;
  winnerProposalId: string | null;
  tiedProposalIds: string[];
  busy: boolean;
  error: string | null;
  onVote: (proposalId: string) => void;
  onClose: () => void;
  onContinue: () => void;
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

function resultCopy(
  winnerProposalId: string | null,
  tiedProposalIds: string[],
  votedCount: number,
): string {
  if (votedCount === 0) return 'No votes were cast.';
  if (tiedProposalIds.length > 0) return 'It’s a tie.';
  if (winnerProposalId) return 'This proposal won.';
  return 'The vote is closed.';
}

/**
 * F28 ballot, then F30's result in the same overlay. The leader ends the
 * vote; the last ballot does not close it, so people can still change their
 * mind. After close, nobody can vote; Continue advances the agenda.
 *
 * Winner / ties / card order come from the server. This view only paints
 * the ids it was given — it does not rank tallies.
 */
export function VotingBallot({
  questionText,
  items,
  tallies,
  myVote,
  votedCount,
  voterCount,
  phase,
  isLeader,
  viewerId,
  leaderId,
  voterStatuses,
  winnerProposalId,
  tiedProposalIds,
  busy,
  error,
  onVote,
  onClose,
  onContinue,
}: VotingBallotProps) {
  const revealed = phase === 'closed';
  const tied = new Set(tiedProposalIds);

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
            {revealed ? 'Results' : 'Voting'}
          </p>
          <h2
            id="voting-ballot-title"
            className="mt-1 text-[18px] font-semibold tracking-[-0.01em] text-rt-ink"
          >
            {questionText ? `“${questionText}”` : revealed ? 'The vote is closed' : 'Choose one proposal'}
          </h2>
          <p className="mt-1 text-[13px] text-rt-ink-muted">
            {revealed
              ? resultCopy(winnerProposalId, tiedProposalIds, votedCount)
              : 'Select one proposal. You can change your mind until the leader ends the vote. Votes are anonymous.'}
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
                  const selected = !revealed && myVote === item.id;
                  const kind =
                    revealed && winnerProposalId === item.id
                      ? 'winner'
                      : revealed && tied.has(item.id)
                        ? 'tied'
                        : null;
                  const card = (
                    <div className={voteResultRing(kind)}>
                      <ProposalCard
                        item={item}
                        isOwnedByViewer={viewerId !== null && item.authorId === viewerId}
                        isAuthorLeader={item.authorId === leaderId}
                        isShortlisted={selected || kind !== null}
                      />
                    </div>
                  );

                  return (
                    <li key={item.id} className="relative">
                      {kind ? <VoteResultBadge kind={kind} /> : null}
                      {revealed ? (
                        card
                      ) : (
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
                          {card}
                        </button>
                      )}
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
          {!revealed && isLeader && voterStatuses ? (
            <LeaderVoterRoster statuses={voterStatuses} />
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-rt-tertiary px-5 py-3">
          <p className="text-[13px] font-medium text-rt-ink">
            {voterCount === 0
              ? 'No one is in the session to vote'
              : `${votedCount} of ${voterCount} voted`}
          </p>
          {!revealed && myVote ? (
            <span className="text-[12px] text-rt-ink-muted">Your vote is in</span>
          ) : null}
          {!revealed && !myVote ? (
            <span className="text-[12px] text-rt-ink-muted">You haven’t voted yet</span>
          ) : null}
          {error ? <span className="text-[12px] text-red-600">{error}</span> : null}
          <div className="ml-auto">
            {isLeader ? (
              <button
                type="button"
                onClick={revealed ? onContinue : onClose}
                disabled={busy}
                className="rounded-full bg-rt-secondary px-4 py-2 text-[13px] font-semibold text-rt-ink hover:bg-rt-secondary-deep hover:text-white disabled:opacity-60"
              >
                {busy ? (revealed ? 'Continuing…' : 'Closing…') : revealed ? 'Continue' : 'End voting'}
              </button>
            ) : (
              <span className="text-[12px] text-rt-ink-muted">
                {revealed
                  ? 'Waiting for the leader to continue'
                  : 'Waiting for the leader to end the vote'}
              </span>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

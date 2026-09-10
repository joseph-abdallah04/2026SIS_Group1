import {
  recapQuestionStatusLabel,
  type SessionRecap,
  type SessionRecapQuestion,
  type VotingTally,
} from '@roundtable/shared';

import { CARD_RADIUS, CARD_WIDTH, STICKY_RADIUS } from '../pinboard/pinboardTokens';
import { ProposalCard } from '../pinboard/ProposalCard';
import { VoteResultBadge, voteResultRing } from '../voting/VoteResultBadge';

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function tallyFor(tallies: VotingTally[], proposalId: string): VotingTally | null {
  return tallies.find((row) => row.proposalId === proposalId) ?? null;
}

function QuestionRecap({
  question,
  index,
  viewerId,
  leaderId,
}: {
  question: SessionRecapQuestion;
  index: number;
  viewerId: string | null;
  leaderId: string;
}) {
  const winnerId = question.winnerProposalId;
  const tied = new Set(question.tiedProposalIds);

  return (
    <section className="rounded-lg border border-rt-tertiary bg-rt-surface px-4 py-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-rt-ink">
          <span className="mr-2 text-[11px] font-semibold text-rt-ink-faint">{index + 1}</span>
          {question.text}
        </h3>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
          {recapQuestionStatusLabel(question)}
        </span>
      </header>

      {question.votedCount > 0 ? (
        <p className="mt-1 text-[12px] text-rt-ink-muted">
          {question.votedCount === 1 ? '1 vote cast' : `${question.votedCount} votes cast`}
        </p>
      ) : null}

      {question.proposals.length === 0 ? (
        <p className="mt-3 text-[13px] text-rt-ink-muted">
          Nothing was shortlisted for this question.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-4">
          {question.proposals.map((item) => {
            const kind =
              winnerId === item.id ? 'winner' : tied.has(item.id) ? 'tied' : null;
            const tally = tallyFor(question.tallies, item.id);
            return (
              <li
                key={item.id}
                className={`relative shrink-0 ${kind ? 'z-10' : ''}`}
                style={{
                  width: CARD_WIDTH[item.type],
                  borderRadius: item.type === 'sticky' ? STICKY_RADIUS : CARD_RADIUS,
                }}
              >
                {kind ? <VoteResultBadge kind={kind} /> : null}
                <div
                  className={voteResultRing(kind)}
                  style={{
                    width: CARD_WIDTH[item.type],
                    borderRadius: item.type === 'sticky' ? STICKY_RADIUS : CARD_RADIUS,
                  }}
                >
                  <ProposalCard
                    item={item}
                    isOwnedByViewer={viewerId !== null && item.authorId === viewerId}
                    isAuthorLeader={item.authorId === leaderId}
                  />
                </div>
                {tally ? (
                  <p className="mt-1.5 text-[11px] font-medium text-rt-ink-muted">
                    {`${tally.percent}% · ${tally.votes} ${tally.votes === 1 ? 'vote' : 'votes'}`}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * F31 recap: title, dates, who took part, the shortlist, and the winner.
 * S04's download lives on the ended-session footer, beside Back to dashboard.
 */
export function SessionSummaryView({
  summary,
  viewerId,
}: {
  summary: SessionRecap;
  viewerId: string | null;
}) {
  const createdAt = formatWhen(summary.createdAt);
  const startedAt = formatWhen(summary.startedAt);
  const endedAt = formatWhen(summary.endedAt);
  const dates = [
    createdAt && `Created ${createdAt}`,
    startedAt && `Started ${startedAt}`,
    endedAt && `Ended ${endedAt}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[19px] font-semibold tracking-[-0.01em]">{summary.title}</h1>
        {dates ? <p className="mt-1 text-[13px] text-rt-ink-muted">{dates}</p> : null}
      </div>

      <div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
          Took part ({summary.participants.length})
        </span>
        <ul className="mt-2 flex flex-col gap-1.5">
          {summary.participants.map((member) => (
            <li
              key={member.userId}
              className="flex items-baseline justify-between gap-3 rounded-lg border border-rt-tertiary bg-rt-surface px-3 py-2 text-[13px]"
            >
              <span className="text-rt-ink">{member.displayName}</span>
              {member.isLeader ? (
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
                  Leader
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
          Questions
        </span>
        {summary.questions.map((question, index) => (
          <QuestionRecap
            key={question.id}
            question={question}
            index={index}
            viewerId={viewerId}
            leaderId={summary.leaderId}
          />
        ))}
      </div>
    </div>
  );
}

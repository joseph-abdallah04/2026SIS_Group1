import { useCallback, useEffect, useState } from 'react';
import {
  recapQuestionStatusLabel,
  type BoardItem,
  type SessionRecap,
  type SessionRecapQuestion,
  type VotingTally,
} from '@roundtable/shared';

import { copyText } from '../../lib/copyText';
import { cardWidth } from '../pinboard/cardMetrics';
import { CARD_RADIUS, STICKY_RADIUS } from '../pinboard/pinboardTokens';
import { ProposalCard } from '../pinboard/ProposalCard';
import { useProposalExport, type ExportFormat } from '../pinboard/proposalExport';
import { stickyPlainText } from '../tools/sticky/stickyMarks';
import { VoteResultBadge, voteResultRing } from '../voting/VoteResultBadge';
import { RecapProposalCard } from './RecapProposalCard';

/** What a card on the summary can do, where the summary offers anything. */
interface CardActions {
  onExport: (item: BoardItem, format: ExportFormat) => void;
  onCopyText: (item: BoardItem) => void;
}

/** How long a note about an export or a copy stays up. */
const STATUS_MS = 4000;

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
  actions,
}: {
  question: SessionRecapQuestion;
  index: number;
  viewerId: string | null;
  leaderId: string | null;
  actions?: CardActions;
}) {
  const winnerId = question.winnerProposalId;
  const tied = new Set(question.tiedProposalIds);

  return (
    <section className="rounded-2xl border border-rt-tertiary bg-rt-surface px-4 py-4">
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
            const kind = winnerId === item.id ? 'winner' : tied.has(item.id) ? 'tied' : null;
            const tally = tallyFor(question.tallies, item.id);
            // Sized to the card, not to its type: a sticky grows with its
            // note, and a slot sized for the smallest would let a long one
            // spill out past its winner ring.
            const width = cardWidth(item);
            return (
              <li
                key={item.id}
                className={`relative shrink-0 ${kind ? 'z-10' : ''}`}
                style={{
                  width,
                  borderRadius: item.type === 'sticky' ? STICKY_RADIUS : CARD_RADIUS,
                }}
              >
                {kind ? <VoteResultBadge kind={kind} /> : null}
                <div
                  className={voteResultRing(kind)}
                  style={{
                    width,
                    borderRadius: item.type === 'sticky' ? STICKY_RADIUS : CARD_RADIUS,
                  }}
                >
                  {actions ? (
                    <RecapProposalCard
                      item={item}
                      viewerId={viewerId}
                      isOwnedByViewer={viewerId !== null && item.authorId === viewerId}
                      isAuthorLeader={item.authorId != null && item.authorId === leaderId}
                      onExport={actions.onExport}
                      onCopyText={actions.onCopyText}
                    />
                  ) : (
                    <ProposalCard
                      item={item}
                      viewerId={viewerId}
                      isOwnedByViewer={viewerId !== null && item.authorId === viewerId}
                      isAuthorLeader={item.authorId != null && item.authorId === leaderId}
                    />
                  )}
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
 *
 * With `cardActions`, each card opens the board's own actions menu, less
 * anything that would change it: Enlarge, Copy text, and Export. Off by
 * default, so a picture of a summary — the landing page's — stays a picture.
 */
export function SessionSummaryView({
  summary,
  viewerId,
  cardActions = false,
}: {
  summary: SessionRecap;
  viewerId: string | null;
  cardActions?: boolean;
}) {
  // A note about the last export or copy. The id makes the same words said
  // twice two notes, so a second export restarts the timer.
  const [status, setStatus] = useState<{ ok: boolean; text: string; id: number } | null>(null);
  const report = useCallback(
    (result: { ok: boolean; text: string }) =>
      setStatus((current) => ({ ...result, id: (current?.id ?? 0) + 1 })),
    [],
  );
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), STATUS_MS);
    return () => clearTimeout(timer);
  }, [status]);
  const onExport = useProposalExport(report);
  const onCopyText = useCallback(
    (item: BoardItem) => {
      if (item.artifactJson.type !== 'sticky') return;
      void copyText(stickyPlainText(item.artifactJson)).then((copied) =>
        report({
          ok: copied,
          text: copied ? 'Copied to clipboard' : 'Could not copy that text',
        }),
      );
    },
    [report],
  );
  const actions: CardActions | undefined = cardActions ? { onExport, onCopyText } : undefined;

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
              className="flex items-baseline justify-between gap-3 rounded-2xl border border-rt-tertiary bg-rt-surface px-3 py-2 text-[13px]"
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
            actions={actions}
          />
        ))}
      </div>

      {/* Fixed to the window rather than set at the top of the page: the card
          it is about is usually scrolled well down. The board's own pill. */}
      {cardActions ? (
        // The live region stays on the page and only its words change: one
        // that arrives together with its words is often not read out at all.
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
        >
          {status ? (
            <p
              key={status.id}
              className={`max-w-full rounded-2xl border bg-white px-3.5 py-1.5 text-center text-[11.5px] font-medium text-balance shadow-sm ${
                status.ok
                  ? 'border-rt-secondary/40 text-rt-secondary-deep'
                  : 'border-red-200 text-red-600'
              }`}
            >
              {status.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

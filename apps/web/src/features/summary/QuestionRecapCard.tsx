import { useId, useState } from 'react';
import { ChevronDown, Hourglass, Info, LayoutDashboard } from 'lucide-react';
import {
  recapEmptyMessage,
  recapQuestionOutcome,
  type SessionRecapQuestion,
} from '@roundtable/shared';

import { questionAnchor } from './RecapDigest';
import { metaLine, rankedProposals, tiedCards, winningCard } from './recapModel';
import { DecisionBanner, IdeaWall, RankedResults, TieBanner } from './RecapResults';
import { KindChip, OutcomeChip, QuestionNumber, useRecapContext } from './recapUi';

function Note({ icon: Icon, children }: { icon: typeof Info; children: string }) {
  return (
    <p className="flex items-start gap-2 text-[12.5px] leading-snug text-rt-ink-muted">
      <Icon aria-hidden size={14} className="mt-px shrink-0" />
      {children}
    </p>
  );
}

function Subhead({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-3 text-[11px] font-bold tracking-[0.1em] text-rt-ink-muted uppercase">
      {children}
      <span aria-hidden className="h-px flex-1 bg-rt-tertiary/60" />
    </p>
  );
}

/** What the card shows under its heading, by what became of the question. */
/**
 * A vote question's other cards, the ones that never made the ballot, folded
 * under its result so the decision stays what is read first. "Ideas on the
 * board" where nothing was shortlisted at all.
 */
function OtherIdeas({ question }: { question: SessionRecapQuestion }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const others = question.otherProposals ?? [];
  if (others.length === 0) return null;
  const title = question.proposals.length > 0 ? 'Not shortlisted' : 'Ideas on the board';
  return (
    <div className="flex flex-col gap-4 border-t border-rt-tertiary/60 pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="-mx-2 flex cursor-pointer items-center gap-2 self-start rounded-full px-2 py-1 text-[12.5px] text-rt-ink-muted transition-colors hover:bg-rt-ink/[0.05] hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
      >
        <span className="font-semibold text-rt-ink">{title}</span>
        <span aria-hidden>·</span>
        <span>{others.length === 1 ? '1 idea' : `${others.length} ideas`}</span>
        <ChevronDown
          aria-hidden
          size={14}
          className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div id={panelId}>
          <IdeaWall items={others} />
        </div>
      ) : null}
    </div>
  );
}

function QuestionBody({ question }: { question: SessionRecapQuestion }) {
  const outcome = recapQuestionOutcome(question);
  const ranked = rankedProposals(question);
  const empty = (
    <p className="rounded-2xl border border-dashed border-rt-tertiary px-4 py-3.5 text-[13px] text-rt-ink-muted">
      {recapEmptyMessage(question)}
    </p>
  );

  switch (outcome.kind) {
    case 'decided': {
      const winner = winningCard(question);
      // The winner is off the shortlist (it should not happen): show what there is.
      if (!winner) return <RankedResults question={question} items={ranked} bars="final" />;
      const rest = ranked.filter((item) => item.id !== winner.id);
      return (
        <>
          <DecisionBanner question={question} winner={winner} />
          {rest.length > 0 ? (
            <>
              <Subhead>The rest of the shortlist</Subhead>
              <RankedResults question={question} items={rest} bars="final" ranks={false} />
            </>
          ) : null}
        </>
      );
    }
    case 'tied': {
      const tied = tiedCards(question);
      const rest = ranked.filter((item) => !question.tiedProposalIds.includes(item.id));
      return (
        <>
          {tied.length > 0 ? <TieBanner question={question} tied={tied} /> : null}
          {rest.length > 0 ? (
            <>
              <Subhead>The rest of the shortlist</Subhead>
              <RankedResults question={question} items={rest} bars="final" ranks={false} />
            </>
          ) : null}
        </>
      );
    }
    case 'vote-open':
      return ranked.length > 0 ? (
        <>
          <Note icon={Hourglass}>
            The session ended while the ballot was open, so these are the votes so far, not a
            result.
          </Note>
          <RankedResults question={question} items={ranked} bars="interim" />
        </>
      ) : (
        empty
      );
    case 'no-votes':
      return ranked.length > 0 ? (
        <>
          <Note icon={Info}>The ballot closed without a vote.</Note>
          <RankedResults question={question} items={ranked} bars="none" />
        </>
      ) : (
        empty
      );
    case 'not-voted':
      return question.proposals.length > 0 ? (
        <>
          <Note icon={Info}>
            Discussed, but the vote never opened. These are the ideas on its board.
          </Note>
          <IdeaWall items={question.proposals} />
        </>
      ) : (
        empty
      );
    case 'discussed':
      return question.proposals.length > 0 ? <IdeaWall items={question.proposals} /> : empty;
    default:
      return empty;
  }
}

/**
 * One question of the meeting, in full (Q1): its number coloured by what
 * became of it, the question, Vote or Brainstorm, the outcome, a quiet line of
 * counts, why it was skipped on a line of its own, then what it decided.
 *
 * Focusable, so "At a glance" can take the keyboard to it.
 */
export function QuestionRecapCard({
  question,
  index,
}: {
  question: SessionRecapQuestion;
  index: number;
}) {
  const outcome = recapQuestionOutcome(question);
  const { openBoard } = useRecapContext();
  const headingId = `${questionAnchor(question.id)}-title`;
  const meta = metaLine(question);
  const reason = question.skipReason?.trim();
  const skippedNote =
    outcome.kind === 'skipped' && reason
      ? { lead: 'Why it was skipped:', text: reason }
      : outcome.kind === 'decided' && outcome.skippedAfter
        ? {
            lead: reason ? 'Skipped after the vote closed:' : 'Skipped after the vote closed.',
            text: reason ?? '',
          }
        : null;

  return (
    <section
      id={questionAnchor(question.id)}
      aria-labelledby={headingId}
      tabIndex={-1}
      className="rt-recap-rise scroll-mt-4 rounded-3xl border border-rt-tertiary/70 bg-rt-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-rt-secondary sm:p-6"
      style={{ ['--rt-recap-i' as string]: Math.min(index + 2, 8) }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5">
          <QuestionNumber n={index + 1} kind={outcome.kind} />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={headingId}
            className="text-[16.5px] leading-snug font-semibold tracking-[-0.01em] break-words text-rt-ink"
          >
            <span className="sr-only">Question {index + 1}: </span>
            {question.text}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-rt-ink-muted">
            <KindChip votingEnabled={question.votingEnabled} />
            <OutcomeChip kind={outcome.kind} />
            {meta ? <span>{meta}</span> : null}
          </div>
        </div>
        {/* Its own board, read-only, at this question rather than the first.
            The words go on a phone, where the card has no room for them. */}
        {openBoard ? (
          <button
            type="button"
            onClick={() => openBoard(question.id)}
            aria-label={`Open the board for question ${index + 1}`}
            title="Open this question’s board"
            className="inline-flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-0 text-[12.5px] font-semibold whitespace-nowrap text-rt-ink-muted transition-colors hover:bg-rt-ink/[0.06] hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none sm:px-3"
          >
            <LayoutDashboard aria-hidden size={14} strokeWidth={2} />
            <span className="hidden sm:inline">Open board</span>
          </button>
        ) : null}
      </div>
      {skippedNote ? (
        <p className="mt-3 rounded-xl bg-rt-surface-alt px-3 py-2.5 text-[13px] leading-relaxed break-words text-rt-ink-muted">
          <span className="font-semibold text-rt-ink">{skippedNote.lead}</span> {skippedNote.text}
        </p>
      ) : null}
      <div className="mt-5 flex flex-col gap-4">
        <QuestionBody question={question} />
        {question.votingEnabled ? <OtherIdeas question={question} /> : null}
      </div>
    </section>
  );
}

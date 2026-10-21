import { useRef, useState } from 'react';
import { Scale, Trophy } from 'lucide-react';
import type { BoardItem, SessionRecapQuestion } from '@roundtable/shared';

import { EnlargeIcon } from '../pinboard/ProposalEnlarge';
import { BuildsOn, Proposer } from './RecapBits';
import { CardThumb, RecapCard } from './RecapCard';
import { RecapEnlarge } from './RecapEnlarge';
import { cardLabel, IDEA_WALL, ideaWallLayout, tallyMap } from './recapModel';
import { useRecapContext } from './recapUi';

function votesWord(count: number): string {
  return count === 1 ? '1 vote' : `${count} votes`;
}

/**
 * W2: what the question decided, heading its card. The winning card at its
 * own size beside its share of the vote, its votes and who proposed it (and
 * whose idea it built on). Side by side where there is room, the card above
 * its numbers where there is not. A light crosses it once as the page arrives.
 */
export function DecisionBanner({
  question,
  winner,
}: {
  question: SessionRecapQuestion;
  winner: BoardItem;
}) {
  const tally = tallyMap(question).get(winner.id);
  return (
    <div className="rt-recap-banner @container relative overflow-hidden rounded-[22px] border border-rt-secondary/45 bg-[radial-gradient(120%_140%_at_0%_0%,#fffaf0_0%,var(--color-rt-secondary-wash)_45%,#fbe9c9_100%)] p-4 sm:p-5">
      <div className="flex flex-col gap-5 @xl:flex-row @xl:items-center @xl:gap-7">
        <div className="w-full @xl:w-auto @xl:shrink-0">
          <RecapCard item={winner} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.12em] text-rt-secondary-deep uppercase">
            <Trophy aria-hidden size={14} strokeWidth={2.2} />
            Decided
          </p>
          {tally && question.votedCount > 0 ? (
            <>
              <p className="text-[44px] leading-none font-semibold tracking-[-0.03em] tabular-nums sm:text-[52px]">
                {tally.percent}
                <span className="ml-0.5 text-[22px] text-rt-secondary-deep">%</span>
              </p>
              <p className="text-[13px] text-rt-ink-muted">
                {tally.votes} of {votesWord(question.votedCount)}
              </p>
            </>
          ) : null}
          <div className="mt-1.5 flex flex-col items-start gap-1.5">
            <Proposer item={winner} prefix="Proposed by" />
            <BuildsOn item={winner} question={question} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A tie: never dressed as a win. Blue-grey, every tied card side by side, and what they each got. */
export function TieBanner({
  question,
  tied,
}: {
  question: SessionRecapQuestion;
  tied: BoardItem[];
}) {
  const tallies = tallyMap(question);
  const votes = tallies.get(tied[0]?.id ?? '')?.votes ?? 0;
  return (
    <div className="flex flex-col gap-4 rounded-[22px] border border-rt-cool/50 bg-[linear-gradient(135deg,#f5f8f9,var(--color-rt-cool-tint))] p-4 sm:p-5">
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.12em] text-rt-cool-deep uppercase">
        <Scale aria-hidden size={14} strokeWidth={2.2} />
        Tied · no single winner
      </p>
      <ul className="flex flex-wrap gap-5">
        {tied.map((item) => {
          const tally = tallies.get(item.id);
          return (
            <li key={item.id} className="flex max-w-full min-w-0 flex-col gap-2.5">
              <RecapCard item={item} />
              {tally ? (
                <span className="self-start rounded-full border border-rt-cool/55 bg-rt-surface px-2.5 py-0.5 text-[11.5px] font-semibold text-rt-cool-deep tabular-nums">
                  {tally.percent}% · {votesWord(tally.votes)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-[12.5px] text-rt-cool-deep">
        {tied.length} ideas share the most votes{votes > 0 ? `, ${votesWord(votes)} each` : ''}.
      </p>
    </div>
  );
}

type BarTone = 'win' | 'tie' | 'interim' | 'plain';

const BAR_FILL: Record<BarTone, string> = {
  win: 'bg-rt-secondary',
  tie: 'bg-rt-cool',
  interim: 'rt-recap-interim',
  plain: 'bg-[#bdbdbd]',
};

/**
 * A card's picture in a row. On the page, pressing it opens the card in the
 * board's own enlarged view (`RecapEnlarge`), the way a drawing opens on the
 * board, and a sticky note the same way; a picture of a summary keeps it a
 * picture. Focus comes back here when the view is put away.
 */
function Thumb({ item, label }: { item: BoardItem; label: string }) {
  const { actions } = useRecapContext();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  if (!actions) {
    return (
      <div className="row-span-2 self-start @2xl:row-span-1 @2xl:self-center">
        <CardThumb item={item} />
      </div>
    );
  }
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Enlarge: ${label}`}
        title="Enlarge"
        className="group/thumb relative row-span-2 cursor-zoom-in self-start rounded-lg transition-shadow hover:ring-3 hover:ring-rt-secondary/35 focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none @2xl:row-span-1 @2xl:self-center"
      >
        <CardThumb item={item} />
        <span
          aria-hidden
          className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-rt-surface/95 text-rt-ink-muted opacity-0 shadow-sm transition-opacity group-hover/thumb:opacity-100 group-focus-visible/thumb:opacity-100"
        >
          <EnlargeIcon size={11} strokeWidth={2.4} />
        </span>
      </button>
      {open ? (
        <RecapEnlarge
          item={item}
          openedFrom={buttonRef.current}
          onClose={() => {
            setOpen(false);
            buttonRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </>
  );
}

/**
 * P2: a shortlist as ranked rows. A small picture of each card, what it says,
 * who proposed it and whose idea it built on, and a bar that grows to its
 * share. Pressing the picture opens the card in the board's enlarged view.
 *
 * Laid out from its own width: on a phone the bar runs under the words, and
 * from about 640px everything sits on one line.
 */
export function RankedResults({
  question,
  items,
  bars,
  ranks = true,
}: {
  question: SessionRecapQuestion;
  items: BoardItem[];
  /** `interim` when the ballot never closed; `none` when nobody voted. */
  bars: 'final' | 'interim' | 'none';
  ranks?: boolean;
}) {
  const { viewerId } = useRecapContext();
  const tallies = tallyMap(question);
  if (items.length === 0) return null;

  return (
    <ol className="@container flex flex-col gap-1">
      {items.map((item, index) => {
        const tally = tallies.get(item.id);
        const tone: BarTone =
          bars === 'interim'
            ? 'interim'
            : question.winnerProposalId === item.id
              ? 'win'
              : question.tiedProposalIds.includes(item.id)
                ? 'tie'
                : 'plain';
        const label = cardLabel(item, viewerId, false);
        return (
          <li key={item.id} className="rounded-2xl transition-colors hover:bg-rt-surface-sunken">
            <div
              className={`grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-2 @2xl:gap-x-4 ${
                ranks
                  ? '@2xl:grid-cols-[1.5rem_4.5rem_minmax(0,1fr)_minmax(6rem,13rem)_5.5rem]'
                  : '@2xl:grid-cols-[4.5rem_minmax(0,1fr)_minmax(6rem,13rem)_5.5rem]'
              }`}
            >
              {ranks ? (
                <span
                  aria-hidden
                  className="hidden text-center text-[12px] font-semibold text-rt-ink-muted tabular-nums @2xl:block"
                >
                  {index + 1}
                </span>
              ) : null}
              <Thumb item={item} label={label} />
              <div className="min-w-0">
                <p className="line-clamp-2 text-[13.5px] leading-snug font-medium text-rt-ink">
                  {label}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Proposer item={item} />
                  <BuildsOn item={item} question={question} />
                </div>
              </div>
              <p className="text-right text-[12px] whitespace-nowrap text-rt-ink-muted tabular-nums @2xl:order-last">
                {bars === 'none' || !tally ? (
                  'No votes'
                ) : (
                  <>
                    <span className="mr-1 text-[15px] font-semibold text-rt-ink">
                      {tally.percent}%
                    </span>
                    {votesWord(tally.votes)}
                  </>
                )}
              </p>
              {bars !== 'none' && tally ? (
                <div
                  aria-hidden
                  className="col-start-2 col-end-4 h-2 overflow-hidden rounded-full bg-[#efefef] @2xl:col-auto"
                >
                  <div
                    className={`rt-recap-bar h-full rounded-full ${BAR_FILL[tone]}`}
                    style={{
                      width: `${tally.percent}%`,
                      ['--rt-recap-i' as string]: index,
                    }}
                  />
                </div>
              ) : (
                <span aria-hidden className="hidden @2xl:block" />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A brainstorm's ideas (B1 + B2): up to six at their board size, a crowd of
 * them smaller so more is seen at once, and past a dozen the rest behind
 * "Show all".
 */
export function IdeaWall({ items }: { items: BoardItem[] }) {
  const [all, setAll] = useState(false);
  const { compact, firstShown } = ideaWallLayout(items.length);
  const shown = all ? items : items.slice(0, firstShown);
  const hidden = items.length - firstShown;
  return (
    <div className="flex flex-col gap-4">
      <ul className={`flex flex-wrap items-start ${compact ? 'gap-3' : 'gap-4'}`}>
        {shown.map((item) => (
          <li key={item.id} className="max-w-full min-w-0">
            <RecapCard item={item} maxScale={compact ? IDEA_WALL.compactScale : 1} />
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setAll((value) => !value)}
          aria-expanded={all}
          className="inline-flex h-9 cursor-pointer items-center self-start rounded-full border border-rt-tertiary bg-rt-surface px-4 text-[12.5px] font-semibold text-rt-ink transition-colors hover:bg-rt-surface-alt focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
        >
          {all ? 'Show fewer' : `Show all ${items.length} ideas`}
        </button>
      ) : null}
    </div>
  );
}

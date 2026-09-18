import { motion, useReducedMotion } from 'motion/react';
import type { BoardItem, VotingTally } from '@roundtable/shared';

import { cardWidth } from '../pinboard/cardMetrics';
import { CARD_RADIUS, CARD_WIDTH, STICKY_RADIUS } from '../pinboard/pinboardTokens';
import { ProposalCard } from '../pinboard/ProposalCard';
import { VoteResultBadge, voteResultRing } from '../voting/VoteResultBadge';
import {
  DEMO,
  DEMO_BALLOT_ITEMS,
  DEMO_BALLOT_TALLIES,
  DEMO_SEATS,
  DEMO_WINNER_ID,
} from './story';

const EASE = [0.22, 1, 0.36, 1] as const;
const CELL = CARD_WIDTH.diagram;
const GAP = 20;
const TALLY = 40;
const ROW = CELL + TALLY;
const GRID_WIDTH = CELL * 2 + GAP;
const GRID_HEIGHT = ROW * 2 + GAP;

function previewSize(item: BoardItem): {
  native: number;
  width: number;
  scale: number;
  radius: string;
} {
  const native = cardWidth(item);
  const sticky = item.type === 'sticky';
  // Stickies are smaller squares on the board than diagram cards. The ballot
  // preview scales them to the diagram width so a 2×2 mix reads as one size.
  return {
    native,
    width: sticky ? CELL : native,
    scale: sticky ? CELL / native : 1,
    radius: sticky ? STICKY_RADIUS : CARD_RADIUS,
  };
}

function tallyFor(proposalId: string): VotingTally {
  return (
    DEMO_BALLOT_TALLIES.find((row) => row.proposalId === proposalId) ?? {
      proposalId,
      votes: 0,
      percent: 0,
    }
  );
}

/**
 * The closed ballot, painted with the same cards, rings, tally bars and chrome
 * as `VotingBallot`. Decorative: nothing here casts a vote.
 */
export function LandingBallot({ compact = false }: { compact?: boolean }) {
  const reduce = useReducedMotion();
  const votedCount = DEMO_SEATS.length;
  const scale = compact ? 0.52 : 0.72;

  return (
    <div
      className="overflow-hidden rounded-2xl border border-rt-tertiary bg-rt-surface shadow-lg"
      aria-hidden="true"
      {...{ inert: '' }}
    >
      <header className="shrink-0 border-b border-rt-tertiary px-5 py-4">
        <p className="text-[10px] font-semibold tracking-[0.14em] text-rt-ink-faint uppercase">
          Results
        </p>
        <p className="mt-1 text-[18px] font-semibold tracking-[-0.01em] text-rt-ink">
          “{DEMO.currentQuestion}”
        </p>
        <p className="mt-1 text-[13px] text-rt-ink-muted">This proposal won.</p>
      </header>

      <div className="flex justify-center overflow-hidden px-4 py-4">
        <div className="relative w-full" style={{ height: GRID_HEIGHT * scale }}>
          <ul
            className="absolute top-0 left-1/2 grid grid-cols-2"
            style={{
              width: GRID_WIDTH,
              height: GRID_HEIGHT,
              gap: GAP,
              transform: `translateX(-50%) scale(${scale})`,
              transformOrigin: 'top center',
            }}
          >
            {DEMO_BALLOT_ITEMS.map((item, index) => {
              const tally = tallyFor(item.id);
              const winner = item.id === DEMO_WINNER_ID;
              const kind = winner ? 'winner' : null;
              const preview = previewSize(item);
              return (
                <li
                  key={item.id}
                  className={`relative flex flex-col items-center ${kind ? 'z-10' : ''}`}
                  style={{ width: CELL }}
                >
                  {kind ? <VoteResultBadge kind={kind} /> : null}
                  <div
                    className={voteResultRing(kind)}
                    style={{
                      width: preview.width,
                      height: item.type === 'sticky' ? preview.width : undefined,
                      borderRadius: preview.radius,
                    }}
                  >
                    <div
                      style={
                        preview.scale === 1
                          ? undefined
                          : {
                              width: preview.native,
                              transform: `scale(${preview.scale})`,
                              transformOrigin: 'top left',
                            }
                      }
                    >
                      <ProposalCard
                        item={item}
                        viewerId={null}
                        isAuthorLeader={item.authorId === 'mira'}
                        interactive={false}
                      />
                    </div>
                  </div>
                  <div className="mt-2 w-full px-0.5" style={{ maxWidth: preview.width }}>
                    <div className="h-1.5 overflow-hidden rounded-full bg-rt-tertiary/60">
                      <motion.div
                        initial={reduce ? false : { scaleX: 0 }}
                        whileInView={{ scaleX: 1 }}
                        viewport={{ once: true, amount: 0.6 }}
                        transition={{ delay: 0.2 + index * 0.12, duration: 0.65, ease: EASE }}
                        className="h-full rounded-full bg-rt-secondary"
                        style={{ width: `${tally.percent}%`, transformOrigin: '0 50%' }}
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
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-rt-tertiary px-5 py-3">
        <p className="text-[13px] font-medium text-rt-ink">
          {votedCount} of {votedCount} voted
        </p>
        <span className="ml-auto rounded-full bg-rt-secondary px-5 py-2.5 text-[14px] font-semibold text-rt-ink shadow-sm">
          Continue to next question
        </span>
      </footer>
    </div>
  );
}

import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { useRef, useState } from 'react';
import type { BoardItem } from '@roundtable/shared';

import { eyebrow, sectionBody, sectionHeading } from './cta';
import { LandingSticky } from './LandingSticky';
import { DEMO, DEMO_FLOW_DIAGRAM, DEMO_PAIR_STICKY, DEMO_PINBOARD_STICKIES } from './story';

const PREVIEW = 0.62;

interface Piece {
  item: BoardItem;
  rotate: number;
  className: string;
  at: number;
  z: number;
}

const PIECES: Piece[] = [
  {
    item: DEMO_PINBOARD_STICKIES[0]!,
    rotate: -5,
    className: 'left-[4%] top-[14%] sm:left-[6%] sm:top-[16%]',
    at: -0.15,
    z: 10,
  },
  {
    item: DEMO_PINBOARD_STICKIES[2]!,
    rotate: 4,
    className: 'right-[4%] top-[16%] sm:right-[7%] sm:top-[18%]',
    at: 0.08,
    z: 11,
  },
  {
    item: DEMO_PINBOARD_STICKIES[1]!,
    rotate: -3,
    className: 'left-[5%] top-[44%] sm:left-[8%] sm:top-[46%]',
    at: 0.24,
    z: 12,
  },
  {
    item: DEMO_PAIR_STICKY,
    rotate: 6,
    className: 'right-[5%] top-[46%] sm:right-[9%] sm:top-[48%]',
    at: 0.4,
    z: 13,
  },
  {
    item: DEMO_FLOW_DIAGRAM,
    rotate: 2,
    className: 'left-[12%] top-[48%] sm:left-[16%] sm:top-[50%]',
    at: 0.54,
    z: 14,
  },
];

function BoardCard({ progress, piece }: { progress: MotionValue<number>; piece: Piece }) {
  const start = Math.max(piece.at, 0);
  const fromRest = piece.at <= 0;
  const y = useTransform(progress, [start, start + 0.12, 1], [fromRest ? 0 : 86, 0, 0]);
  const scale = useTransform(
    progress,
    [start, start + 0.12, 1],
    [fromRest ? PREVIEW : 0.86 * PREVIEW, PREVIEW, PREVIEW],
  );
  const tilt = useTransform(
    progress,
    [start, start + 0.12, 1],
    [piece.rotate - (fromRest ? 0 : 14), piece.rotate, piece.rotate],
  );
  const opacity = useTransform(progress, [start, start + 0.08, 1], [fromRest ? 1 : 0, 1, 1]);

  return (
    <motion.div
      style={{ y, scale, rotate: tilt, opacity, zIndex: piece.z }}
      className={`absolute origin-top-left ${piece.className}`}
    >
      <LandingSticky item={piece.item} isAuthorLeader={piece.item.authorId === 'mira'} />
    </motion.div>
  );
}

function PeerCursor({ progress }: { progress: MotionValue<number> }) {
  const x = useTransform(progress, [0, 0.35, 0.7, 1], ['46%', '54%', '47%', '52%']);
  const y = useTransform(progress, [0, 0.35, 0.7, 1], ['24%', '54%', '32%', '46%']);
  const smoothX = useSpring(x, { stiffness: 120, damping: 24 });
  const smoothY = useSpring(y, { stiffness: 120, damping: 24 });

  return (
    <motion.div
      aria-hidden="true"
      style={{ left: smoothX, top: smoothY }}
      className="pointer-events-none absolute z-20 flex items-start gap-1 max-sm:hidden"
    >
      <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 drop-shadow-sm">
        <path d="M1 1l10 4.2-4.3 1.3L5.4 11z" fill="#7A6A4C" />
      </svg>
      <span className="rounded-full bg-rt-secondary-deep px-1.5 py-0.5 text-[9px] font-semibold text-white">
        Elena
      </span>
    </motion.div>
  );
}

function ProposeToast({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0.28, 0.34, 0.46, 0.54], [0, 1, 1, 0]);
  const y = useTransform(progress, [0.28, 0.34], [12, 0]);

  return (
    <motion.p
      aria-hidden="true"
      style={{ opacity, y }}
      className="absolute bottom-3 left-3 z-30 rounded-full border border-rt-secondary/20 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-rt-ink shadow-sm"
    >
      Elena proposed a sticky
    </motion.p>
  );
}

function PinboardFrame({
  progress,
  live,
  count,
}: {
  progress: MotionValue<number>;
  live: boolean;
  count: number;
}) {
  return (
    <div
      className="rt-landing-board relative aspect-square w-full overflow-hidden rounded-2xl border border-rt-secondary/20 shadow-[0_32px_80px_rgba(122,106,76,0.18)] sm:aspect-[5/4]"
      aria-hidden="true"
      {...{ inert: '' }}
    >
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-rt-secondary/15 bg-white/85 px-4 py-2.5 backdrop-blur-sm">
        <p className="truncate text-[11px] font-semibold text-rt-ink">{DEMO.currentQuestion}</p>
        <span className="shrink-0 rounded-full bg-rt-primary-tint px-2 py-0.5 text-[9px] font-semibold tracking-[0.1em] text-rt-ink-muted uppercase">
          Discussion · {count} {count === 1 ? 'proposal' : 'proposals'}
        </span>
      </div>

      {PIECES.map((piece) => (
        <BoardCard key={piece.item.id} progress={progress} piece={piece} />
      ))}
      {live ? (
        <>
          <PeerCursor progress={progress} />
          <ProposeToast progress={progress} />
        </>
      ) : null}
    </div>
  );
}

function proposalCount(progress: number): number {
  if (progress < 0.12) return 1;
  if (progress < 0.28) return 2;
  if (progress < 0.42) return 3;
  if (progress < 0.56) return 4;
  return 5;
}

export function PinboardBeat() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const settled = useMotionValue(1);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const progress = reduce ? settled : scrollYProgress;
  const [count, setCount] = useState(reduce ? 5 : 1);

  useMotionValueEvent(progress, 'change', (value) => {
    const next = proposalCount(value);
    setCount((present) => (present === next ? present : next));
  });

  const copy = (
    <div className="max-w-lg">
      <p className={eyebrow}>The pinboard</p>
      <h2 className={sectionHeading}>Talk on a call. Put the ideas on the board.</h2>
      <p className={sectionBody}>
        While a question is open, everyone can hear each other and see the same canvas. A proposal
        is a sticky note, a drawing, or a diagram. The moment you propose it, it appears for the
        whole room.
      </p>
      <ul className="mt-7 space-y-3.5 text-[14.5px] leading-relaxed text-rt-ink-muted">
        {[
          'Only the author can edit what they posted. The leader can take a card off the board.',
          'React on a card when you agree, instead of saying the same thing out loud.',
          'Extend someone else’s idea to copy it into your editor, change it, and propose your own version. The original stays put.',
        ].map((item) => (
          <li key={item} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rt-secondary"
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );

  if (reduce) {
    return (
      <section
        id="pinboard"
        className="mx-auto grid max-w-6xl scroll-mt-20 items-center gap-14 px-6 py-24 lg:grid-cols-2"
      >
        {copy}
        <PinboardFrame progress={progress} live={false} count={5} />
      </section>
    );
  }

  return (
    <section id="pinboard" ref={ref} className="relative h-[240vh] scroll-mt-20">
      <div className="sticky top-16 flex min-h-[calc(100svh-4rem)] items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 py-12 lg:grid-cols-2">
          {copy}
          <PinboardFrame progress={progress} live count={count} />
        </div>
      </div>
    </section>
  );
}

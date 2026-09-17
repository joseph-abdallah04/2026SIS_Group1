import { useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';

import { FadeUp } from './FadeUp';

const NOTES = [
  {
    text: 'Ship the recap as a PDF',
    color: '#FDF4E5',
    rotate: -6,
    className: 'left-[8%] top-[14%] w-40',
    range: [0, 0.28],
  },
  {
    text: 'Keep the join code on the rail',
    color: '#F9EEF2',
    rotate: 5,
    className: 'right-[10%] top-[18%] w-44',
    range: [0.12, 0.42],
  },
  {
    text: 'Voice stays from lobby to board',
    color: '#EEF2F4',
    rotate: -3,
    className: 'left-[18%] top-[48%] w-44',
    range: [0.28, 0.58],
  },
  {
    text: 'Vote once. That is the answer.',
    color: '#EEF4F0',
    rotate: 4,
    className: 'right-[16%] top-[52%] w-44',
    range: [0.42, 0.72],
  },
];

function BoardNote({
  progress,
  text,
  color,
  rotate,
  className,
  range,
}: {
  progress: MotionValue<number>;
  text: string;
  color: string;
  rotate: number;
  className: string;
  range: number[];
}) {
  const y = useTransform(progress, [range[0] ?? 0, range[1] ?? 1, 1], [88, 0, 0]);
  const opacity = useTransform(progress, [range[0] ?? 0, range[1] ?? 1, 1], [0, 1, 1]);
  const tilt = useTransform(progress, [range[0] ?? 0, range[1] ?? 1, 1], [rotate - 10, rotate, rotate]);

  return (
    <motion.article
      style={{ y, opacity, rotate: tilt, background: color }}
      className={`rt-landing-sticky absolute p-4 text-[13px] leading-snug font-medium text-rt-ink ${className}`}
    >
      {text}
    </motion.article>
  );
}

function DiagramCard({ progress }: { progress: MotionValue<number> }) {
  const y = useTransform(progress, [0.55, 0.88, 1], [80, 0, 0]);
  const opacity = useTransform(progress, [0.55, 0.88, 1], [0, 1, 1]);

  return (
    <motion.article
      style={{ y, opacity }}
      className="rt-landing-sticky absolute bottom-[10%] left-1/2 w-56 -translate-x-1/2 bg-white p-4"
    >
      <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">Diagram</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="rounded-md bg-rt-primary-tint px-2 py-1 text-[11px] font-semibold">Lobby</span>
        <span aria-hidden className="text-rt-ink-faint">
          →
        </span>
        <span className="rounded-md bg-rt-cool-tint px-2 py-1 text-[11px] font-semibold">Board</span>
        <span aria-hidden className="text-rt-ink-faint">
          →
        </span>
        <span className="rounded-md bg-rt-secondary/30 px-2 py-1 text-[11px] font-semibold">Vote</span>
      </div>
    </motion.article>
  );
}

function PinboardFrame({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="rt-landing-board relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-rt-secondary/20 shadow-[0_24px_60px_rgba(122,106,76,0.12)]">
      {NOTES.map((note) => (
        <BoardNote key={note.text} progress={progress} {...note} />
      ))}
      <DiagramCard progress={progress} />
    </div>
  );
}

/**
 * One pinned scene: scrolling drops stickies onto the dotted desk.
 * Reduced motion skips the pin and shows the finished board.
 */
export function PinboardBeat() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const settled = useMotionValue(1);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  });
  const progress = reduce ? settled : scrollYProgress;

  const copy = (
    <FadeUp className="max-w-lg">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-rt-secondary-deep uppercase">
        The pinboard
      </p>
      <h2 className="mt-3 font-serif text-4xl font-bold tracking-tight text-rt-ink md:text-5xl">
        Put it on the board.
      </h2>
      <p className="mt-4 text-[16px] leading-relaxed text-rt-ink-muted">
        Stickies, diagrams, drawings. Proposed by you, visible to everyone, as they arrive.
      </p>
    </FadeUp>
  );

  if (reduce) {
    return (
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-2">
        {copy}
        <PinboardFrame progress={progress} />
      </section>
    );
  }

  return (
    <section ref={ref} className="rt-landing-pin relative h-[160vh]">
      <div className="rt-landing-pin-inner sticky top-16 flex min-h-[calc(100svh-4rem)] items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2">
          {copy}
          <PinboardFrame progress={progress} />
        </div>
      </div>
    </section>
  );
}

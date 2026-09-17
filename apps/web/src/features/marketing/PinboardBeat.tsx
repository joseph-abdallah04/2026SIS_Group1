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

import { eyebrow, sectionBody, sectionHeading } from './cta';
import { DEMO } from './story';

interface Note {
  text: string;
  author: string;
  color: string;
  rotate: number;
  className: string;
  at: number;
  reactions?: string;
}

const NOTES: Note[] = [
  {
    text: 'Provision accounts the day the offer is signed',
    author: 'Mira',
    color: '#FDF1DC',
    rotate: -5,
    className: 'left-[4%] top-[14%] w-[46%] sm:left-[6%] sm:top-[16%] sm:w-[34%]',
    at: -0.15,
    reactions: '3',
  },
  {
    text: 'One setup script, not a twelve-page wiki',
    author: 'Alex',
    color: '#F3EEF6',
    rotate: 4,
    className: 'right-[4%] top-[16%] w-[46%] sm:right-[7%] sm:top-[18%] sm:w-[33%]',
    at: 0.08,
  },
  {
    text: 'Seed the workspace so day one is never empty',
    author: 'Elena',
    color: '#E9F1F3',
    rotate: -3,
    className: 'left-[5%] top-[44%] w-[46%] sm:left-[8%] sm:top-[46%] sm:w-[34%]',
    at: 0.24,
    reactions: '5',
  },
  {
    text: 'Pair on the first pull request before lunch',
    author: 'Aisha',
    color: '#EAF3EC',
    rotate: 6,
    className: 'right-[5%] top-[46%] w-[44%] sm:right-[9%] sm:top-[48%] sm:w-[30%]',
    at: 0.4,
  },
];

const FLOW = ['Offer signed', 'Accounts', 'Workspace', 'Day one'];

function NoteCard({ note }: { note: Note }) {
  return (
    <>
      <p className="text-[12px] leading-snug font-medium text-rt-ink sm:text-[13px]">{note.text}</p>
      <p className="mt-2.5 text-[10px] font-semibold tracking-[0.08em] text-rt-ink-faint uppercase">
        {note.author}
      </p>
      {note.reactions ? (
        <span className="absolute -right-2 -bottom-2.5 flex items-center gap-1 rounded-full border border-rt-secondary/25 bg-white px-2 py-0.5 text-[10px] font-semibold text-rt-ink shadow-sm">
          <span aria-hidden="true">👍</span>
          {note.reactions}
        </span>
      ) : null}
    </>
  );
}

function BoardNote({ progress, note }: { progress: MotionValue<number>; note: Note }) {
  const start = Math.max(note.at, 0.02);
  const y = useTransform(progress, [start, start + 0.12, 1], [86, 0, 0]);
  const scale = useTransform(progress, [start, start + 0.12, 1], [0.86, 1, 1]);
  const tilt = useTransform(progress, [start, start + 0.12, 1], [note.rotate - 14, note.rotate, note.rotate]);
  const opacity = useTransform(progress, [start, start + 0.08, 1], [0, 1, 1]);
  const reactionScale = useTransform(progress, [start + 0.14, start + 0.22, 1], [0, 1, 1]);

  if (note.at <= 0) {
    return (
      <article
        style={{ rotate: `${note.rotate}deg`, background: note.color }}
        className={`rt-landing-sticky absolute z-10 p-3.5 sm:p-4 ${note.className}`}
      >
        <NoteCard note={note} />
      </article>
    );
  }

  return (
    <motion.article
      style={{ y, scale, rotate: tilt, opacity, background: note.color }}
      className={`rt-landing-sticky absolute z-10 p-3.5 sm:p-4 ${note.className}`}
    >
      <p className="text-[12px] leading-snug font-medium text-rt-ink sm:text-[13px]">{note.text}</p>
      <p className="mt-2.5 text-[10px] font-semibold tracking-[0.08em] text-rt-ink-faint uppercase">
        {note.author}
      </p>
      {note.reactions ? (
        <motion.span
          style={{ scale: reactionScale }}
          className="absolute -right-2 -bottom-2.5 flex items-center gap-1 rounded-full border border-rt-secondary/25 bg-white px-2 py-0.5 text-[10px] font-semibold text-rt-ink shadow-sm"
        >
          <span aria-hidden="true">👍</span>
          {note.reactions}
        </motion.span>
      ) : null}
    </motion.article>
  );
}

function FlowNode({
  progress,
  label,
  index,
}: {
  progress: MotionValue<number>;
  label: string;
  index: number;
}) {
  const start = 0.68 + index * 0.05;
  const fill = useTransform(progress, [start, start + 0.06, 1], [0.25, 1, 1]);

  return (
    <motion.span
      style={{ opacity: fill }}
      className="flex-1 rounded-md border border-rt-secondary/25 bg-rt-primary-tint px-1.5 py-1.5 text-center text-[10px] font-semibold text-rt-ink"
    >
      {label}
    </motion.span>
  );
}

function DiagramCard({ progress }: { progress: MotionValue<number> }) {
  const y = useTransform(progress, [0.54, 0.72, 1], [72, 0, 0]);
  const opacity = useTransform(progress, [0.54, 0.66, 1], [0, 1, 1]);

  return (
    <motion.article
      style={{ y, opacity }}
      className="rt-landing-sticky absolute bottom-[6%] left-1/2 w-[82%] -translate-x-1/2 bg-white p-3.5 sm:w-[64%]"
    >
      <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
        Diagram · Alex
      </p>
      <div className="mt-3 flex items-center gap-1.5">
        {FLOW.map((node, index) => (
          <div key={node} className="flex flex-1 items-center gap-1.5">
            <FlowNode progress={progress} label={node} index={index} />
            {index < FLOW.length - 1 ? (
              <span aria-hidden="true" className="text-[11px] text-rt-ink-faint">
                →
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </motion.article>
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
    <div className="rt-landing-board relative aspect-square w-full overflow-hidden rounded-2xl border border-rt-secondary/20 shadow-[0_32px_80px_rgba(122,106,76,0.18)] sm:aspect-[5/4]">
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-rt-secondary/15 bg-white/85 px-4 py-2.5 backdrop-blur-sm">
        <p className="truncate text-[11px] font-semibold text-rt-ink">{DEMO.currentQuestion}</p>
        <span className="shrink-0 rounded-full bg-rt-primary-tint px-2 py-0.5 text-[9px] font-semibold tracking-[0.1em] text-rt-ink-muted uppercase">
          Discussion · {count} {count === 1 ? 'proposal' : 'proposals'}
        </span>
      </div>

      {NOTES.map((note) => (
        <BoardNote key={note.text} progress={progress} note={note} />
      ))}
      <DiagramCard progress={progress} />
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
      <h2 className={sectionHeading}>Talk on voice. Put the ideas on the board.</h2>
      <p className={sectionBody}>
        While a question is open, everyone can hear each other and see the same canvas. A
        proposal is a sticky note, a drawing, or a diagram. The moment you propose it, it
        appears for the whole room.
      </p>
      <ul className="mt-7 space-y-3.5 text-[14.5px] leading-relaxed text-rt-ink-muted">
        {[
          'Only the author can edit or delete what they posted.',
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

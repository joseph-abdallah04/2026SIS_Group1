import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { useRef } from 'react';

import { eyebrow, sectionBody, sectionHeading } from './cta';
import { Reveal } from './motion';

interface Note {
  text: string;
  author: string;
  color: string;
  rotate: number;
  className: string;
  /** Scroll window over which the note lands, as a fraction of the act. */
  at: number;
  reactions?: string;
}

const NOTES: Note[] = [
  {
    text: 'Provision accounts at offer stage',
    author: 'Mira',
    color: '#FDF1DC',
    rotate: -5,
    className: 'left-[4%] top-[13%] w-[45%] sm:left-[5%] sm:top-[15%] sm:w-[34%]',
    at: 0.06,
    reactions: '3',
  },
  {
    text: 'One setup script, not a twelve page wiki',
    author: 'Joseph',
    color: '#F3EEF6',
    rotate: 4,
    className: 'right-[4%] top-[15%] w-[45%] sm:right-[6%] sm:top-[17%] sm:w-[33%]',
    at: 0.18,
  },
  {
    text: 'Seed the workspace so day one is never empty',
    author: 'Elena',
    color: '#E9F1F3',
    rotate: -3,
    className: 'left-[5%] top-[42%] w-[45%] sm:left-[8%] sm:top-[44%] sm:w-[34%]',
    at: 0.3,
    reactions: '5',
  },
  {
    text: 'Buddy for week one, 15 min a day',
    author: 'Aisha',
    color: '#EAF3EC',
    rotate: 6,
    className: 'right-[5%] top-[45%] w-[42%] sm:right-[8%] sm:top-[46%] sm:w-[30%]',
    at: 0.42,
  },
];

const FLOW = ['Offer signed', 'Accounts', 'Workspace', 'Day one'];

function BoardNote({ progress, note }: { progress: MotionValue<number>; note: Note }) {
  const arrival: [number, number, number] = [note.at, note.at + 0.14, 1];
  const y = useTransform(progress, arrival, [70, 0, 0]);
  const scale = useTransform(progress, arrival, [0.88, 1, 1]);
  const tilt = useTransform(progress, arrival, [note.rotate - 12, note.rotate, note.rotate]);
  const reactionScale = useTransform(progress, [note.at + 0.14, note.at + 0.22, 1], [0, 1, 1]);

  return (
    <motion.article
      style={{ y, scale, rotate: tilt, background: note.color }}
      className={`rt-landing-sticky absolute p-3.5 sm:p-4 ${note.className}`}
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
  const start = 0.7 + index * 0.05;
  const opacity = useTransform(progress, [start, start + 0.06, 1], [0.3, 1, 1]);

  return (
    <motion.span
      style={{ opacity }}
      className="flex-1 rounded-md border border-rt-secondary/25 bg-rt-primary-tint px-1.5 py-1.5 text-center text-[10px] font-semibold text-rt-ink"
    >
      {label}
    </motion.span>
  );
}

function DiagramCard({ progress }: { progress: MotionValue<number> }) {
  const y = useTransform(progress, [0.56, 0.76, 1], [64, 0, 0]);
  const scale = useTransform(progress, [0.56, 0.76, 1], [0.9, 1, 1]);

  return (
    <motion.article
      style={{ y, scale }}
      className="rt-landing-sticky absolute bottom-[5%] left-1/2 w-[80%] -translate-x-1/2 bg-white p-3.5 sm:w-[62%]"
    >
      <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
        Diagram · Joseph
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

/** Another participant's pointer drifting across the shared board. */
function PeerCursor({ progress }: { progress: MotionValue<number> }) {
  // Kept to the clear gutter between the two note columns so the pointer never
  // sits on top of somebody's proposal.
  const x = useTransform(progress, [0, 0.35, 0.7, 1], ['46%', '54%', '47%', '52%']);
  const y = useTransform(progress, [0, 0.35, 0.7, 1], ['22%', '52%', '30%', '44%']);
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

function PinboardFrame({ progress, live }: { progress: MotionValue<number>; live: boolean }) {
  return (
    <div className="rt-landing-board relative aspect-square w-full overflow-hidden rounded-2xl border border-rt-secondary/20 shadow-[0_28px_70px_rgba(122,106,76,0.16)] sm:aspect-[5/4]">
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between border-b border-rt-secondary/15 bg-white/80 px-4 py-2.5 backdrop-blur-sm">
        <p className="truncate text-[11px] font-semibold text-rt-ink">
          Q2 · How do we cut onboarding to one day?
        </p>
        <span className="shrink-0 rounded-full bg-rt-primary-tint px-2 py-0.5 text-[9px] font-semibold tracking-[0.1em] text-rt-ink-muted uppercase">
          Discussion
        </span>
      </div>

      {NOTES.map((note) => (
        <BoardNote key={note.text} progress={progress} note={note} />
      ))}
      <DiagramCard progress={progress} />
      {live ? <PeerCursor progress={progress} /> : null}
    </div>
  );
}

/**
 * Pinned act: the board assembles as you scroll, one proposal at a time, the
 * way it fills during a live discussion phase. With motion reduced there is no
 * scroll timeline, so the scene renders already assembled.
 */
export function PinboardBeat() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const settled = useMotionValue(1);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const progress = reduce ? settled : scrollYProgress;

  const copy = (
    <div className="max-w-lg">
      <Reveal>
        <p className={eyebrow}>The shared pinboard</p>
        <h2 className={sectionHeading}>Everyone proposes at once.</h2>
        <p className={sectionBody}>
          No hands up, no waiting for a turn. Type a sticky, sketch something freehand, or build a
          diagram in the popup editor, and it appears on everyone&apos;s board the moment you
          propose it.
        </p>
      </Reveal>
      <Reveal delay={0.1}>
        <ul className="mt-7 space-y-3 text-[14.5px] text-rt-ink-muted">
          {[
            'You own what you post: only the author can move, edit or delete it.',
            'React to a proposal instead of repeating it out loud.',
            'Extend anyone\u2019s idea and it opens pre-filled, credited back to them.',
          ].map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rt-secondary" />
              {item}
            </li>
          ))}
        </ul>
      </Reveal>
    </div>
  );

  if (reduce) {
    return (
      <section
        id="pinboard"
        className="mx-auto grid max-w-6xl scroll-mt-20 items-center gap-14 px-6 py-24 lg:grid-cols-2"
      >
        {copy}
        <PinboardFrame progress={progress} live={false} />
      </section>
    );
  }

  return (
    <section id="pinboard" ref={ref} className="relative h-[220vh] scroll-mt-20">
      <div className="sticky top-16 flex min-h-[calc(100svh-4rem)] items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 py-12 lg:grid-cols-2">
          {copy}
          <PinboardFrame progress={progress} live />
        </div>
      </div>
    </section>
  );
}

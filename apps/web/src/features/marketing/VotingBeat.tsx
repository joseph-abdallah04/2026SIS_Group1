import { motion, useReducedMotion } from 'motion/react';

import { eyebrow, sectionBody, sectionHeading } from './cta';
import { Reveal } from './motion';

const BALLOT = [
  { text: 'Provision accounts the day the offer is signed', votes: 2, share: 33 },
  { text: 'Seeded demo workspace on day one', votes: 3, share: 50, winner: true },
  { text: 'Buddy for week one, 15 minutes a day', votes: 1, share: 17 },
];

/** Bar reveal is gated on the card entering view, so the count reads as a tally
 * landing rather than a static chart that was always there. */
function BallotRow({ option, index }: { option: (typeof BALLOT)[number]; index: number }) {
  const reduce = useReducedMotion();

  return (
    <li
      className={`relative rounded-lg border p-3 transition-colors ${
        option.winner
          ? 'border-rt-secondary/60 bg-rt-secondary/10'
          : 'border-rt-secondary/15 bg-white/70'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] leading-snug font-medium text-rt-ink">{option.text}</p>
        {option.winner ? (
          <motion.span
            initial={reduce ? false : { scale: 0.5 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 1.15, type: 'spring', stiffness: 320, damping: 18 }}
            className="shrink-0 rounded-full bg-rt-secondary-deep px-2 py-0.5 text-[9px] font-bold tracking-[0.1em] text-white uppercase"
          >
            Answer
          </motion.span>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-rt-secondary/15">
          <motion.div
            initial={reduce ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ delay: 0.25 + index * 0.18, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            style={{ width: `${option.share}%`, transformOrigin: '0 50%' }}
            className={`h-full rounded-full ${option.winner ? 'bg-rt-secondary-deep' : 'bg-rt-secondary/50'}`}
          />
        </div>
        <span className="w-14 shrink-0 text-right text-[11px] font-semibold text-rt-ink-faint">
          {option.votes} {option.votes === 1 ? 'vote' : 'votes'}
        </span>
      </div>
    </li>
  );
}

function BallotCard() {
  const reduce = useReducedMotion();

  return (
    <div className="rt-landing-panel rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
          Shortlist · 3 of 9 proposals
        </p>
        <span className="rounded-full bg-rt-cool-tint px-2 py-0.5 text-[9px] font-semibold tracking-[0.1em] text-rt-ink-muted uppercase">
          Voting
        </span>
      </div>

      <ul className="mt-4 space-y-2.5">
        {BALLOT.map((option, index) => (
          <BallotRow key={option.text} option={option} index={index} />
        ))}
      </ul>

      <div className="relative mt-4 h-8 border-t border-rt-secondary/15 pt-3">
        <motion.p
          initial={reduce ? false : { opacity: 1 }}
          whileInView={{ opacity: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 1.05, duration: 0.3 }}
          className="absolute inset-x-0 top-3 text-[11.5px] font-medium text-rt-ink-faint"
        >
          Waiting on Tom and Aisha…
        </motion.p>
        <motion.p
          initial={reduce ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 1.15, duration: 0.35 }}
          className="absolute inset-x-0 top-3 text-[11.5px] font-semibold text-rt-secondary-deep"
        >
          All six votes in — winner declared
        </motion.p>
      </div>
    </div>
  );
}

export function VotingBeat() {
  return (
    <section
      id="voting"
      className="scroll-mt-20 border-t border-rt-secondary/15 bg-white/40 py-24"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-2 lg:gap-20">
        <Reveal className="order-2 lg:order-1">
          <BallotCard />
        </Reveal>

        <div className="order-1 max-w-lg lg:order-2">
          <Reveal>
            <p className={eyebrow}>Voting</p>
            <h2 className={sectionHeading}>One vote each, and the question is closed.</h2>
            <p className={sectionBody}>
              When the discussion has run its course the leader shortlists the proposals worth
              deciding between. Everyone in the room gets exactly one vote, the leader included.
            </p>
            <p className="mt-4 text-[15.5px] leading-relaxed text-rt-ink-muted">
              Choices stay private and the tally stays hidden until the last ballot lands, so
              nobody is voting with the room. You can see who still has to vote, never what they
              picked. The moment everyone has, the winning proposal is written down as that
              question&apos;s answer and the session moves on.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

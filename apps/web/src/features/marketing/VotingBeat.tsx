import { motion, useReducedMotion } from 'motion/react';

import { initialsFromName, SEAT_PALETTE } from '../sessions/waitingRoomSeats';
import { eyebrow, sectionBody, sectionHeading } from './cta';
import { DEMO, DEMO_SEATS, DEMO_SHORTLIST } from './story';

const EASE = [0.22, 1, 0.36, 1] as const;

function BallotRow({
  option,
  index,
}: {
  option: (typeof DEMO_SHORTLIST)[number];
  index: number;
}) {
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
            transition={{ delay: 1.35, type: 'spring', stiffness: 320, damping: 18 }}
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
            transition={{ delay: 0.85 + index * 0.12, duration: 0.7, ease: EASE }}
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

function VoterRow() {
  const reduce = useReducedMotion();

  return (
    <ul className="flex flex-wrap gap-2">
      {DEMO_SEATS.map((seat, index) => {
        const swatch = SEAT_PALETTE[index % SEAT_PALETTE.length];
        return (
          <motion.li
            key={seat.name}
            initial={reduce ? false : { y: 8 }}
            whileInView={{ y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 + index * 0.1, duration: 0.4, ease: EASE }}
            className="flex items-center gap-1.5 rounded-full border border-rt-secondary/20 bg-white px-1.5 py-1 pr-2.5"
          >
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold"
              style={{ background: swatch?.background, color: swatch?.color }}
            >
              {initialsFromName(seat.name)}
            </span>
            <span className="text-[10.5px] font-medium text-rt-ink">{seat.name.split(' ')[0]}</span>
            <motion.span
              initial={reduce ? false : { scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.22 + index * 0.12, type: 'spring', stiffness: 400, damping: 16 }}
              className="text-[10px] font-bold text-rt-secondary-deep"
            >
              ✓
            </motion.span>
          </motion.li>
        );
      })}
    </ul>
  );
}

function BallotCard() {
  const reduce = useReducedMotion();

  return (
    <div className="rt-landing-panel rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
          {DEMO.currentQuestion}
        </p>
        <span className="rounded-full bg-rt-cool-tint px-2 py-0.5 text-[9px] font-semibold tracking-[0.1em] text-rt-ink-muted uppercase">
          Voting
        </span>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[10px] font-semibold tracking-[0.1em] text-rt-ink-faint uppercase">
          Ballots in
        </p>
        <VoterRow />
      </div>

      <ul className="mt-5 space-y-2.5">
        {DEMO_SHORTLIST.map((option, index) => (
          <BallotRow key={option.text} option={option} index={index} />
        ))}
      </ul>

      <div className="relative mt-4 h-8 border-t border-rt-secondary/15 pt-3">
        <motion.p
          initial={reduce ? false : { opacity: 1 }}
          whileInView={{ opacity: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 1.2, duration: 0.3 }}
          className="absolute inset-x-0 top-3 text-[11.5px] font-medium text-rt-ink-faint"
        >
          Waiting on the last two votes…
        </motion.p>
        <motion.p
          initial={reduce ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 1.3, duration: 0.35 }}
          className="absolute inset-x-0 top-3 text-[11.5px] font-semibold text-rt-secondary-deep"
        >
          The leader ended the vote. This is the answer.
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
        <div className="order-2 lg:order-1">
          <BallotCard />
        </div>

        <div className="order-1 max-w-lg lg:order-2">
          <p className={eyebrow}>Voting</p>
          <h2 className={sectionHeading}>The leader shortlists. Everyone votes once.</h2>
          <p className={sectionBody}>
            When discussion has gone far enough, the leader chooses which proposals are worth
            deciding between. Each person in the room casts one private vote, including the
            leader.
          </p>
          <p className="mt-4 text-[15.5px] leading-relaxed text-rt-ink-muted">
            The leader can see who still needs to vote, never what they picked. You can change
            your mind until they end the round — or until the timer does. The running tally is
            on the cards while voting is open. When they close, the winning proposal is written
            down as that question’s answer, and they continue.
          </p>
        </div>
      </div>
    </section>
  );
}

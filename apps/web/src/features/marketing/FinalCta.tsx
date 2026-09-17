import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';

import { initialsFromName, SEAT_PALETTE } from '../sessions/waitingRoomSeats';
import { ctaGhost, ctaPrimary } from './cta';
import { Reveal, RevealHeading } from './motion';
import { isSignedIn } from './signedIn';

const SEATS = ['Mira H.', 'Joseph A.', 'Elena N.', 'Tom W.', 'Aisha B.', 'Shafin R.'];

/** The table reduced to its point: a fixed set of seats, all the same size. */
function SeatRow() {
  const reduce = useReducedMotion();

  return (
    <div className="flex justify-center -space-x-2.5" aria-hidden="true">
      {SEATS.map((name, index) => {
        const swatch = SEAT_PALETTE[index % SEAT_PALETTE.length];
        return (
          <motion.span
            key={name}
            initial={reduce ? false : { scale: 0.5, y: 10 }}
            whileInView={{ scale: 1, y: 0 }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{ delay: index * 0.07, type: 'spring', stiffness: 300, damping: 18 }}
            style={{ background: swatch?.background, color: swatch?.color }}
            className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#f7f4ee] text-[12px] font-semibold shadow-sm"
          >
            {initialsFromName(name)}
          </motion.span>
        );
      })}
    </div>
  );
}

export function FinalCta() {
  const signedIn = isSignedIn();

  return (
    <section className="relative overflow-hidden border-t border-rt-secondary/15">
      <div className="rt-landing-glow" aria-hidden="true" />

      <div className="relative mx-auto max-w-3xl px-6 py-28 text-center">
        <div className="mb-9">
          <SeatRow />
        </div>

        <h2 className="font-serif text-[2.2rem] leading-[1.1] font-bold tracking-tight text-balance text-rt-ink sm:text-[2.9rem]">
          <RevealHeading text="Bring a question. Leave with an answer." />
        </h2>

        <Reveal delay={0.12}>
          <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-rt-ink-muted">
            Create a session, send the code, and run your next decision at a table where everyone
            gets a seat and the outcome is written down.
          </p>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            {signedIn ? (
              <Link to="/dashboard" className={`${ctaPrimary} px-6`}>
                Go to your dashboard
              </Link>
            ) : (
              <>
                <Link to="/signup" className={`${ctaPrimary} px-6`}>
                  Create your account
                </Link>
                <Link to="/login" className={`${ctaGhost} px-6`}>
                  Log in
                </Link>
              </>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

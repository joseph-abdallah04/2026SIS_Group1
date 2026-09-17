import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';

import { initialsFromName, SEAT_PALETTE } from '../sessions/waitingRoomSeats';
import { ctaGhost, ctaPrimary } from './cta';
import { Reveal, RevealHeading } from './motion';
import { isSignedIn } from './signedIn';
import { DEMO_SEATS } from './story';

function SeatRow() {
  const reduce = useReducedMotion();

  return (
    <div className="flex justify-center -space-x-2.5" aria-hidden="true">
      {DEMO_SEATS.map((seat, index) => {
        const swatch = SEAT_PALETTE[index % SEAT_PALETTE.length];
        return (
          <motion.span
            key={seat.name}
            initial={reduce ? false : { scale: 0.5, y: 12 }}
            whileInView={{ scale: 1, y: 0 }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{ delay: index * 0.08, type: 'spring', stiffness: 300, damping: 18 }}
            style={{ background: swatch?.background, color: swatch?.color }}
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#f7f4ee] text-[12px] font-semibold shadow-sm"
          >
            {initialsFromName(seat.name)}
          </motion.span>
        );
      })}
    </div>
  );
}

export function FinalCta() {
  const signedIn = isSignedIn();

  return (
    <section className="relative border-t border-rt-secondary/15">

      <div className="relative mx-auto max-w-3xl px-6 py-28 text-center">
        <div className="mb-10">
          <SeatRow />
        </div>

        <h2 className="font-serif text-[2.25rem] leading-[1.08] font-bold tracking-tight text-balance text-rt-ink sm:text-[3rem]">
          <RevealHeading text="Create a session. Send the join code." />
        </h2>

        <Reveal delay={0.12}>
          <p className="mx-auto mt-5 max-w-xl text-[16.5px] leading-relaxed text-rt-ink-muted">
            Write the questions you need answered, share the code, and run the meeting at a table
            where every seat votes and the outcome is already written down.
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
                  Create an account
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

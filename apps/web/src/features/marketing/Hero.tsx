import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';

import { ctaGhost, ctaPrimary } from './cta';
import { FadeUp } from './FadeUp';
import { RoundTableScene } from './RoundTableScene';
import { isSignedIn } from './signedIn';

const HERO_SEATS = [
  { name: 'Amina', leader: true, speaking: true },
  { name: 'Ben' },
  { name: 'Chi' },
  { name: 'Dee' },
] as const;

export function Hero() {
  const signedIn = isSignedIn();
  const reduce = useReducedMotion();

  return (
    <section className="mx-auto flex max-w-6xl flex-col justify-center gap-12 px-6 py-16 lg:min-h-[calc(100svh-4rem)] lg:flex-row lg:items-center lg:gap-16">
      <div className="max-w-xl">
        <FadeUp>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-rt-secondary-deep uppercase">
            Facilitated sessions
          </p>
          <h1 className="mt-4 font-serif text-4xl leading-[1.08] font-bold tracking-tight text-rt-ink sm:text-5xl lg:text-[3.4rem]">
            Sessions that end in a decision, not a doc.
          </h1>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-rt-ink-muted">
            Sit down together. Put ideas on one board. Vote once. Walk away with the answers written
            down.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {signedIn ? (
              <Link to="/dashboard" className={ctaPrimary}>
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link to="/signup" className={ctaPrimary}>
                  Sign up
                </Link>
                <Link to="/login" className={ctaGhost}>
                  Log in
                </Link>
              </>
            )}
          </div>
        </FadeUp>
      </div>

      <FadeUp delay={0.12} className="mx-auto w-full max-w-md lg:mx-0">
        <motion.div
          animate={reduce ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        >
          <RoundTableScene seats={HERO_SEATS} />
        </motion.div>
      </FadeUp>
    </section>
  );
}

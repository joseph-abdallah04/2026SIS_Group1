import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { Link } from 'react-router-dom';

import { ctaGhost, ctaPrimary, eyebrow } from './cta';
import { Reveal, RevealHeading } from './motion';
import { RoundTableScene } from './RoundTableScene';
import { isSignedIn } from './signedIn';

const SEATS = [
  { name: 'Mira H.', leader: true },
  { name: 'Joseph A.', speaking: true },
  { name: 'Shafin R.' },
  { name: 'Elena N.' },
  { name: 'Tom W.' },
  { name: 'Aisha B.' },
];

const FACTS = [
  { value: '1 vote', label: 'per person, per question' },
  { value: '0 keys', label: 'to buy — bring your own model' },
  { value: 'Every answer', label: 'recorded in the recap' },
];

export function Hero() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const sceneY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);
  const signedIn = isSignedIn();

  return (
    <section ref={ref} className="relative overflow-hidden">
      <div className="rt-landing-glow" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-24 lg:pb-28">
        <div className="max-w-xl">
          <Reveal>
            <p className={eyebrow}>Structured group decision sessions</p>
          </Reveal>

          <h1 className="mt-5 font-serif text-[2.6rem] leading-[1.06] font-bold tracking-tight text-balance text-rt-ink sm:text-[3.4rem] lg:text-[3.75rem]">
            <RevealHeading text="Sessions that end in a decision, not a doc." />
          </h1>

          <Reveal delay={0.12}>
            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-rt-ink-muted">
              A leader sets the agenda, the team joins by code, and every question is worked the
              same way: talk it through on voice, put ideas on a shared pinboard, then vote. The
              winning proposal is recorded as that question's answer before anyone moves on.
            </p>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              {signedIn ? (
                <Link to="/dashboard" className={`${ctaPrimary} px-6`}>
                  Go to your dashboard
                </Link>
              ) : (
                <>
                  <Link to="/signup" className={`${ctaPrimary} px-6`}>
                    Start a session
                  </Link>
                  <Link to="/login" className={`${ctaGhost} px-6`}>
                    Log in
                  </Link>
                </>
              )}
            </div>
          </Reveal>

          <Reveal delay={0.28}>
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-5 border-t border-rt-secondary/20 pt-6">
              {FACTS.map((fact) => (
                <div key={fact.value}>
                  <dt className="font-serif text-[15px] font-bold text-rt-ink">{fact.value}</dt>
                  <dd className="mt-1 text-[12px] leading-snug text-rt-ink-faint">{fact.label}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        {/* A lobby, framed as the product renders it: the session has not been
            started yet, so there is a join code and a waiting room, and no
            question or voice state on screen. */}
        <motion.div style={{ y: sceneY }} className="relative mx-auto w-full max-w-lg">
          <div className="rt-landing-panel overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-rt-secondary/15 bg-white/60 px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate font-serif text-[15px] font-bold text-rt-ink">
                  Q3 planning, product team
                </p>
                <p className="mt-0.5 text-[11px] text-rt-ink-faint">5 questions on the agenda</p>
              </div>
              <span className="shrink-0 rounded-full bg-rt-cool-tint px-2.5 py-1 text-[9px] font-semibold tracking-[0.12em] text-rt-ink-muted uppercase">
                Lobby
              </span>
            </div>

            <div className="rt-landing-scene mx-auto w-[70%] pt-9 pb-12">
              <RoundTableScene seats={SEATS} showNames stagger joinCode="RT-4821" />
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-rt-secondary/15 bg-white/60 px-5 py-3.5">
              <p className="flex items-center gap-2 text-[12px] font-medium text-rt-ink-muted">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rt-secondary opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rt-secondary-deep" />
                </span>
                6 of 6 joined
              </p>
              <span className="rounded-full bg-rt-secondary px-3.5 py-1.5 text-[11.5px] font-semibold text-rt-ink shadow-sm">
                Start session
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="rt-landing-cue mx-auto flex w-fit flex-col items-center gap-1.5 pb-10 text-rt-ink-faint">
        <span className="text-[10px] font-semibold tracking-[0.18em] uppercase">Scroll</span>
        <span aria-hidden="true" className="text-sm leading-none">
          ↓
        </span>
      </div>
    </section>
  );
}

import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ctaGhost, ctaPrimary, eyebrow } from './cta';
import { Reveal, RevealHeading } from './motion';
import { LandingLobby, LobbyFooter } from './RoundTableScene';
import { isSignedIn } from './signedIn';
import { DEMO_SEATS } from './story';

function useJoinedCount(active: boolean, total: number, reduce: boolean | null) {
  const [count, setCount] = useState(reduce ? total : 0);

  useEffect(() => {
    if (reduce) {
      setCount(total);
      return;
    }
    if (!active) return;

    setCount(0);
    const timers = Array.from({ length: total }, (_, index) =>
      window.setTimeout(() => setCount(index + 1), 280 + index * 220),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [active, reduce, total]);

  return count;
}

export function Hero() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const sceneY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -70]);
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 0.96]);
  const signedIn = isSignedIn();
  const [ready, setReady] = useState(Boolean(reduce));
  const joined = useJoinedCount(ready, DEMO_SEATS.length, reduce);
  const full = joined >= DEMO_SEATS.length;

  const seats = DEMO_SEATS.slice(0, joined).map((seat) => ({
    name: seat.name,
    leader: seat.leader,
    speaking: full && Boolean(seat.speaking),
  }));

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <section ref={ref} className="relative overflow-hidden">

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pt-24 lg:pb-24">
        <div className="max-w-xl">
          <Reveal when="mount">
            <p className={eyebrow}>Live brainstorming sessions for teams</p>
          </Reveal>

          <h1 className="mt-5 font-serif text-[2.7rem] leading-[1.05] font-bold tracking-tight text-balance text-rt-ink sm:text-[3.55rem] lg:text-[3.85rem]">
            <RevealHeading when="mount" text="Every question leaves with an answer." />
          </h1>

          <Reveal when="mount" delay={0.12}>
            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-rt-ink-muted">
              RoundTable is a facilitated brainstorming session. A leader writes the agenda, the team
              joins by code, and each question is discussed live on a shared pinboard — then voted on.
              The winning proposal is stored as the answer before you move to the next question.
            </p>
          </Reveal>

          <Reveal when="mount" delay={0.2}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
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

          <Reveal when="mount" delay={0.28}>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-5 border-t border-rt-secondary/20 pt-6">
              <div>
                <dt className="font-serif text-[15px] font-bold text-rt-ink">Live call</dt>
                <dd className="mt-1 text-[12px] leading-snug text-rt-ink-faint">
                  For live collaboration
                </dd>
              </div>
              <div>
                <dt className="font-serif text-[15px] font-bold text-rt-ink">One vote</dt>
                <dd className="mt-1 text-[12px] leading-snug text-rt-ink-faint">
                  Per person, per question
                </dd>
              </div>
              <div>
                <dt className="font-serif text-[15px] font-bold text-rt-ink">A recap</dt>
                <dd className="mt-1 text-[12px] leading-snug text-rt-ink-faint">
                  Every answer, written down
                </dd>
              </div>
            </dl>
          </Reveal>
        </div>

        <motion.div style={{ y: sceneY, scale: sceneScale }} className="relative mx-auto w-full max-w-lg">
          <LandingLobby
            seats={seats}
            stagger={!reduce}
            footer={
              <LobbyFooter
                status={`${joined} of ${DEMO_SEATS.length} joined`}
                ready={full}
              />
            }
          />
        </motion.div>
      </div>

      <div className="rt-landing-cue mx-auto flex w-fit flex-col items-center gap-2 pb-10 text-rt-ink-faint">
        <span className="text-[10px] font-semibold tracking-[0.2em] uppercase">
          Scroll through a session
        </span>
        <span aria-hidden="true" className="rt-landing-cue-line" />
      </div>
    </section>
  );
}

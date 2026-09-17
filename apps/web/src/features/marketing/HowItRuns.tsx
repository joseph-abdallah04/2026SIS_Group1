import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { eyebrow, sectionBody, sectionHeading } from './cta';
import { Reveal } from './motion';
import { FILM_SCENES } from './SessionFilm';

const EASE = [0.22, 1, 0.36, 1] as const;

function useDesktopFilm() {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(min-width: 1024px)');
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return desktop;
}

function Intro() {
  return (
    <>
      <p className={eyebrow}>How a session runs</p>
      <h2 className={sectionHeading}>A session is an agenda you work through live.</h2>
      <p className={sectionBody}>
        The leader writes the questions, and can extend the agenda at any point. Every question
        follows the same path: discuss on the pinboard, shortlist, vote. The winning proposal is
        stored as the answer. When the session ends, that list is the recap.
      </p>
    </>
  );
}

function FilmStage({ scene }: { scene: number }) {
  const entry = FILM_SCENES[scene];
  if (!entry) return null;
  const Visual = entry.Visual;

  return (
    <div className="relative min-h-[34rem]">
      <AnimatePresence mode="wait">
        <motion.div
          key={entry.title}
          initial={{ opacity: 0, y: 22, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.99 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          <Visual />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function HowItRunsStacked({ animate }: { animate: boolean }) {
  return (
    <section id="how-it-runs" className="scroll-mt-20 border-t border-rt-secondary/15 py-24">
      <div className="mx-auto max-w-6xl px-6">
        {animate ? (
          <Reveal>
            <Intro />
          </Reveal>
        ) : (
          <Intro />
        )}

        <ol className="mt-16 space-y-16">
          {FILM_SCENES.map((step, index) => {
            const Visual = step.Visual;
            return (
              <li
                key={step.title}
                className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
              >
                <div>
                  <p className="font-serif text-[13px] font-bold text-rt-secondary-deep">
                    {String(index + 1).padStart(2, '0')}
                  </p>
                  <h3 className="mt-2 font-serif text-[1.45rem] font-bold text-rt-ink">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-md text-[15px] leading-relaxed text-rt-ink-muted">
                    {step.body}
                  </p>
                </div>
                {animate ? (
                  <Reveal delay={0.08}>
                    <Visual />
                  </Reveal>
                ) : (
                  <Visual />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function HowItRunsFilm() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [scene, setScene] = useState(0);

  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    const next = Math.min(
      FILM_SCENES.length - 1,
      Math.max(0, Math.floor(value * FILM_SCENES.length)),
    );
    setScene((present) => (present === next ? present : next));
  });

  return (
    <section id="how-it-runs" ref={ref} className="relative h-[360vh] scroll-mt-20">
      <div className="sticky top-16 flex min-h-[calc(100svh-4rem)] items-center border-t border-rt-secondary/15">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-10 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16">
          <div>
            <p className={eyebrow}>How a session runs</p>
            <h2 className={sectionHeading}>A session is an agenda you work through live.</h2>
            <p className={sectionBody}>
              Scroll through the meeting. The shape does not change: agenda, lobby, pinboard, vote,
              recap.
            </p>

            <div className="relative mt-10 min-h-[13.5rem]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={FILM_SCENES[scene]?.title ?? scene}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  <p className="font-serif text-[13px] font-bold text-rt-secondary-deep">
                    {String(scene + 1).padStart(2, '0')} /{' '}
                    {String(FILM_SCENES.length).padStart(2, '0')}
                  </p>
                  <h3 className="mt-3 font-serif text-[1.65rem] leading-tight font-bold text-rt-ink">
                    {FILM_SCENES[scene]?.title}
                  </h3>
                  <p className="mt-3 max-w-md text-[15.5px] leading-relaxed text-rt-ink-muted">
                    {FILM_SCENES[scene]?.body}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="mt-8 flex gap-1.5" aria-hidden="true">
              {FILM_SCENES.map((step, index) => (
                <span
                  key={step.title}
                  className={`h-1 rounded-full transition-[width,background-color] duration-300 ${
                    index === scene ? 'w-9 bg-rt-secondary-deep' : 'w-3 bg-rt-secondary/25'
                  }`}
                />
              ))}
            </div>
          </div>

          <FilmStage scene={scene} />
        </div>
      </div>
    </section>
  );
}

export function HowItRuns() {
  const reduce = useReducedMotion();
  const desktop = useDesktopFilm();

  if (reduce || !desktop) {
    return <HowItRunsStacked animate={!reduce} />;
  }

  return <HowItRunsFilm />;
}

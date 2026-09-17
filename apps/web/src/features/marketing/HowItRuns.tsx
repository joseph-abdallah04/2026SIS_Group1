import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { useRef } from 'react';

import { eyebrow, sectionBody, sectionHeading } from './cta';
import { Reveal } from './motion';

const STEPS = [
  {
    title: 'Write the agenda',
    body: 'A session is a focus plus an ordered list of questions. Whoever creates it leads it, and can edit or reorder anything right up until the room opens.',
  },
  {
    title: 'Fill the room',
    body: 'Share a join code or link. Everyone waits in a lobby where you can see exactly who has arrived, and the session starts for all of them at once.',
  },
  {
    title: 'Talk it through',
    body: 'Voice connects the moment the session begins, with a live speaking indicator so you always know who has the floor. No separate call to organise.',
  },
  {
    title: 'Propose, out loud and on the board',
    body: 'Sticky notes, freehand sketches and diagrams land on one shared pinboard in real time. React to what you like, or extend someone else\u2019s idea into your own.',
  },
  {
    title: 'Vote, once',
    body: 'The leader shortlists the strongest proposals. Everyone gets a single private vote, and when the last one lands the winner is recorded as the answer.',
  },
  {
    title: 'Leave with the recap',
    body: 'End the session and every question is paired with the proposal that won it. It stays on your dashboard for anyone who was in the room.',
  },
];

export function HowItRuns() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 65%', 'end 75%'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.4 });
  const scaleY = useTransform(smooth, (value) => (reduce ? 1 : value));

  return (
    <section id="how-it-runs" className="scroll-mt-20 border-t border-rt-secondary/15 py-24">
      <div className="mx-auto grid max-w-6xl gap-14 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Reveal>
            <p className={eyebrow}>How a session runs</p>
            <h2 className={sectionHeading}>Six steps, and the same six every time.</h2>
            <p className={sectionBody}>
              The value of a round table is that nobody has to negotiate the process. RoundTable
              fixes the shape of the meeting so the only thing up for debate is the question in
              front of you.
            </p>
          </Reveal>
        </div>

        <ol ref={ref} className="relative pl-12">
          <div
            aria-hidden="true"
            className="absolute top-2 bottom-2 left-[15px] w-px bg-rt-secondary/15"
          />
          <motion.div
            aria-hidden="true"
            className="rt-landing-phase-line absolute top-2 bottom-2 left-[15px] w-px origin-top"
            style={{ scaleY }}
          />

          {STEPS.map((step, index) => (
            <Reveal
              as="li"
              key={step.title}
              delay={index * 0.04}
              className="relative pb-11 last:pb-0"
            >
              <motion.span
                aria-hidden="true"
                initial={reduce ? false : { scale: 0.4 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true, amount: 0.8 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="absolute top-0.5 -left-12 flex h-8 w-8 items-center justify-center rounded-full border border-rt-secondary/35 bg-white font-serif text-[13px] font-bold text-rt-secondary-deep shadow-sm"
              >
                {index + 1}
              </motion.span>
              <h3 className="font-serif text-[19px] font-bold text-rt-ink">{step.title}</h3>
              <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-rt-ink-muted">
                {step.body}
              </p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

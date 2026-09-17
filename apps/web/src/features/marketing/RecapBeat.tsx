import { motion, useReducedMotion } from 'motion/react';

import { eyebrow, sectionBody, sectionHeading } from './cta';
import { DEMO, DEMO_QUESTIONS, DEMO_SEATS } from './story';

export function RecapBeat() {
  const reduce = useReducedMotion();

  return (
    <section id="recap" className="scroll-mt-20 border-t border-rt-secondary/15 bg-white/40 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="max-w-lg">
          <p className={eyebrow}>The recap</p>
          <h2 className={sectionHeading}>The recap is the list of answers.</h2>
          <p className={sectionBody}>
            When the leader ends the session, voice disconnects and the board is frozen. What
            remains is each agenda question paired with the proposal that won it — or marked
            skipped, if the leader moved on without a vote.
          </p>
          <p className="mt-4 text-[15.5px] leading-relaxed text-rt-ink-muted">
            Everyone who was in the room can open it from the dashboard afterwards. There is
            nothing extra to write up.
          </p>
        </div>

        <div className="rt-landing-panel overflow-hidden rounded-2xl">
            <div className="flex items-baseline justify-between gap-4 border-b border-rt-secondary/15 bg-white/70 px-6 py-4">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
                  Session ended
                </p>
                <h3 className="mt-1 font-serif text-[19px] font-bold text-rt-ink">{DEMO.title}</h3>
              </div>
              <span className="shrink-0 text-[11px] font-medium text-rt-ink-faint">
                {DEMO_SEATS.length} people
              </span>
            </div>

            <ol className="divide-y divide-rt-secondary/12 px-6">
              {DEMO_QUESTIONS.map((row, index) => (
                <motion.li
                  key={row.text}
                  initial={reduce ? false : { y: 18 }}
                  whileInView={{ y: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ delay: 0.1 + index * 0.12, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="py-4"
                >
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-rt-ink-faint uppercase">
                    Question {index + 1}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-snug text-rt-ink-muted">{row.text}</p>
                  <p className="mt-2 flex items-start gap-2 text-[14px] font-semibold text-rt-ink">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rt-secondary-deep"
                    />
                    {row.answer}
                  </p>
                </motion.li>
              ))}
            </ol>
          </div>
      </div>
    </section>
  );
}

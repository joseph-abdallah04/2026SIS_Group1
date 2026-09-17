import { eyebrow, sectionBody, sectionHeading } from './cta';
import { Reveal } from './motion';

const ROWS = [
  {
    question: 'What is the one metric for this quarter?',
    answer: 'Time from signup to first completed session',
  },
  {
    question: 'How do we cut onboarding to one day?',
    answer: 'Seeded demo workspace on day one',
  },
  {
    question: 'Who owns the migration runbook?',
    answer: 'Platform, with a review from Elena before the freeze',
  },
  { question: 'Do we rebuild the billing screen now?', skipped: true },
];

export function RecapBeat() {
  return (
    <section className="border-t border-rt-secondary/15 bg-white/40 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="max-w-lg">
          <Reveal>
            <p className={eyebrow}>The recap</p>
            <h2 className={sectionHeading}>Nobody has to write the minutes.</h2>
            <p className={sectionBody}>
              The summary is built from what the session actually decided: each question on the
              agenda paired with the proposal that won it, and anything the leader skipped marked
              as skipped rather than quietly dropped.
            </p>
            <p className="mt-4 text-[15.5px] leading-relaxed text-rt-ink-muted">
              It appears the moment the leader ends the session, voice disconnects cleanly, and it
              stays on the dashboard for everyone who was in the room.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className="rt-landing-panel rounded-2xl p-6">
            <div className="flex items-baseline justify-between gap-4 border-b border-rt-secondary/15 pb-4">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
                  Session summary
                </p>
                <h3 className="mt-1 font-serif text-[19px] font-bold text-rt-ink">
                  Q3 planning, product team
                </h3>
              </div>
              <span className="shrink-0 text-[11px] font-medium text-rt-ink-faint">6 people</span>
            </div>

            <ol className="mt-1 divide-y divide-rt-secondary/12">
              {ROWS.map((row, index) => (
                <Reveal as="li" key={row.question} delay={0.08 + index * 0.08} y={16}>
                  <div className="py-4">
                    <p className="text-[12.5px] leading-snug text-rt-ink-muted">{row.question}</p>
                    {row.skipped ? (
                      <p className="mt-1.5 text-[13.5px] font-semibold text-rt-ink-faint italic">
                        Skipped
                      </p>
                    ) : (
                      <p className="mt-1.5 flex items-start gap-2 text-[14px] font-semibold text-rt-ink">
                        <span
                          aria-hidden="true"
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rt-secondary-deep"
                        />
                        {row.answer}
                      </p>
                    )}
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

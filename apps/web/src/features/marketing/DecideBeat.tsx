import { FadeUp } from './FadeUp';

const SHORTLIST = [
  { title: 'Keep the join code on the rail', votes: '2', winner: false },
  { title: 'Vote once. That is the answer.', votes: '5', winner: true },
  { title: 'Ship the recap as a PDF', votes: '3', winner: false },
] as const;

export function DecideBeat() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 md:grid-cols-2">
      <FadeUp className="md:order-2">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-rt-secondary-deep uppercase">
          The ballot
        </p>
        <h2 className="mt-3 font-serif text-4xl font-bold tracking-tight text-rt-ink md:text-5xl">
          Vote once. That is the answer.
        </h2>
        <p className="mt-4 max-w-md text-[16px] leading-relaxed text-rt-ink-muted">
          React, shortlist, ballot. The winner becomes the recorded answer to the question — not
          another thread to forget.
        </p>
      </FadeUp>
      <FadeUp delay={0.08} className="relative">
        <div className="flex flex-col gap-3">
          {SHORTLIST.map((item) => (
            <article
              key={item.title}
              className={`rounded-2xl border bg-white px-5 py-4 shadow-sm ${
                item.winner
                  ? 'border-rt-secondary ring-2 ring-rt-secondary/40'
                  : 'border-rt-tertiary/70'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[14px] font-semibold text-rt-ink">{item.title}</p>
                {item.winner ? (
                  <span className="rounded-full bg-rt-secondary px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-rt-ink uppercase">
                    Winner
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-[12px] text-rt-ink-faint">
                {item.winner ? '🔥 ✨' : '👍'} · {item.votes} votes
              </p>
            </article>
          ))}
        </div>
      </FadeUp>
    </section>
  );
}

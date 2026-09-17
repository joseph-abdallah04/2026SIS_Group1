import { Link } from 'react-router-dom';

import { ctaGhost, ctaPrimary } from './cta';
import { FadeUp } from './FadeUp';
import { isSignedIn } from './signedIn';

const RECAP = [
  { question: 'What do we ship first?', answer: 'Vote once. That is the answer.' },
  { question: 'How do people join?', answer: 'Keep the join code on the rail' },
  { question: 'What do we leave with?', answer: 'Ship the recap as a PDF' },
] as const;

export function WalkAway() {
  const signedIn = isSignedIn();

  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <FadeUp>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-rt-secondary-deep uppercase">
            The recap
          </p>
          <h2 className="mt-3 font-serif text-4xl font-bold tracking-tight text-rt-ink md:text-5xl">
            Leave with the decisions.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[16px] leading-relaxed text-rt-ink-muted">
            Every question, the winning idea, a recap you can actually use.
          </p>
        </FadeUp>
        <FadeUp delay={0.1} className="mt-10 overflow-hidden rounded-3xl border border-rt-secondary/20 bg-white text-left shadow-sm">
          {RECAP.map((row, index) => (
            <div
              key={row.question}
              className={`flex flex-col gap-1 px-6 py-5 sm:flex-row sm:items-baseline sm:gap-8 ${
                index < RECAP.length - 1 ? 'border-b border-rt-tertiary/60' : ''
              }`}
            >
              <p className="font-serif text-[15px] text-rt-ink sm:w-1/2">{row.question}</p>
              <p className="text-[14px] font-medium text-rt-secondary-deep sm:w-1/2">{row.answer}</p>
            </div>
          ))}
        </FadeUp>
        <FadeUp delay={0.16} className="mt-10 flex flex-wrap items-center justify-center gap-3">
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
        </FadeUp>
      </div>
    </section>
  );
}

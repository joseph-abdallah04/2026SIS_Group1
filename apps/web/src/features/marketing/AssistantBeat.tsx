import { motion, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { eyebrow, sectionBody, sectionHeading } from './cta';
import { Reveal } from './motion';

const REPLY =
  'Three angles teams usually take on day-one onboarding: pre-provisioning, a seeded workspace, and a named buddy. Want these as stickies?';

const SUGGESTIONS = [
  'Pre-provision accounts at offer stage',
  'Seed the workspace with real sample data',
  'Name a buddy before the start date',
];

const POINTS = [
  {
    title: 'Your provider, your key',
    body: 'Point it at any OpenAI-compatible base URL with your own key and model, then test the connection from settings. The key is stored server-side and never handed back to the browser.',
  },
  {
    title: 'It already knows where you are',
    body: 'The assistant is given the session focus, the question on screen, the current phase, the recent proposals and whatever board item you have selected, so you are not re-explaining the meeting to it.',
  },
  {
    title: 'It drafts, you propose',
    body: 'It can search the web, build a diagram or rough out a handful of stickies. Nothing reaches the board until you press Propose, and when you do the proposal is authored by you.',
  },
];

/**
 * Types the assistant reply out when the panel scrolls into view. The full
 * string is always in the DOM for screen readers and tests; only the visible
 * copy is animated.
 */
function StreamedReply() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLParagraphElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const timer = window.setInterval(() => {
      setShown((count) => {
        if (count >= REPLY.length) {
          window.clearInterval(timer);
          return count;
        }
        return count + 2;
      });
    }, 18);
    return () => window.clearInterval(timer);
  }, [inView, reduce]);

  const visible = reduce ? REPLY : REPLY.slice(0, shown);
  const done = visible.length >= REPLY.length;

  return (
    <p ref={ref} className="text-[12.5px] leading-relaxed text-rt-ink">
      <span className="sr-only">{REPLY}</span>
      <span aria-hidden="true">
        {visible}
        {done ? null : (
          <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-rt-secondary-deep" />
        )}
      </span>
    </p>
  );
}

function AssistantPanel() {
  const reduce = useReducedMotion();

  return (
    <div className="rt-landing-panel overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2.5 border-b border-rt-secondary/15 bg-white/70 px-4 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rt-secondary/25 text-[11px] font-bold text-rt-secondary-deep">
          AI
        </span>
        <p className="text-[12px] font-semibold text-rt-ink">Your assistant</p>
        <span className="ml-auto rounded-full bg-rt-cool-tint px-2 py-0.5 text-[9px] font-semibold tracking-[0.1em] text-rt-ink-muted uppercase">
          Private to you
        </span>
      </div>

      <div className="space-y-3 p-4">
        <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-rt-secondary/20 px-3.5 py-2 text-[12.5px] text-rt-ink">
          What are we missing on this question?
        </div>

        <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-rt-secondary/15 bg-white px-3.5 py-2.5">
          <StreamedReply />
        </div>

        <div className="space-y-2 pt-1">
          {SUGGESTIONS.map((suggestion, index) => (
            <motion.div
              key={suggestion}
              initial={reduce ? false : { y: 14, scale: 0.96 }}
              whileInView={{ y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ delay: 1.5 + index * 0.14, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="rt-landing-sticky flex items-center gap-2 bg-[#FDF1DC] px-3 py-2 text-[11.5px] font-medium text-rt-ink"
            >
              <span className="flex-1">{suggestion}</span>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={reduce ? false : { y: 10 }}
          whileInView={{ y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ delay: 2, duration: 0.4 }}
          className="flex items-center justify-between pt-1"
        >
          <p className="text-[10.5px] text-rt-ink-faint">Sticky ideation · 3 drafts</p>
          <span className="rounded-full bg-rt-secondary px-3 py-1.5 text-[11px] font-semibold text-rt-ink shadow-sm">
            Propose to board
          </span>
        </motion.div>
      </div>
    </div>
  );
}

export function AssistantBeat() {
  return (
    <section id="assistant" className="scroll-mt-20 border-t border-rt-secondary/15 py-24">
      <div className="mx-auto grid max-w-6xl items-start gap-14 px-6 lg:grid-cols-2 lg:gap-20">
        <div className="max-w-lg">
          <Reveal>
            <p className={eyebrow}>Personal assistant</p>
            <h2 className={sectionHeading}>Bring your own model into the room.</h2>
            <p className={sectionBody}>
              Everyone in the session gets their own assistant, and nobody else sees it. RoundTable
              does not resell anyone tokens, which is exactly why your provider details are yours
              to set.
            </p>
          </Reveal>

          <dl className="mt-9 space-y-7">
            {POINTS.map((point, index) => (
              <Reveal key={point.title} delay={index * 0.06}>
                <dt className="font-serif text-[17px] font-bold text-rt-ink">{point.title}</dt>
                <dd className="mt-1.5 text-[14.5px] leading-relaxed text-rt-ink-muted">
                  {point.body}
                </dd>
              </Reveal>
            ))}
          </dl>
        </div>

        <Reveal delay={0.1} className="lg:sticky lg:top-28">
          <AssistantPanel />
        </Reveal>
      </div>
    </section>
  );
}

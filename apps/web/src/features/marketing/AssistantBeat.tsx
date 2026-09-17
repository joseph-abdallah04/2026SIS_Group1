import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { StickyColor } from '@roundtable/shared';

import { ArtifactCard } from '../assistant/ArtifactCard';
import '../assistant/assistant.css';
import { eyebrow, sectionBody, sectionHeading } from './cta';

const REPLY =
  'Three things teams usually fix first: accounts ready at offer, a workspace that is not empty on day one, and a named buddy. Want these as stickies?';

const DRAFTS: { text: string; color: StickyColor }[] = [
  { text: 'Provision accounts the day the offer is signed', color: 'yellow' },
  { text: 'Seed the workspace with real sample data', color: 'blue' },
];

const POINTS = [
  {
    title: 'Your key, in your settings',
    body: 'Connect any OpenAI-compatible base URL with your own API key and model, then test it from settings. RoundTable does not sell tokens. The key is stored on the server and is never sent back to the browser.',
  },
  {
    title: 'It already knows the meeting',
    body: 'The assistant is given the session focus, the question on screen, the current phase, recent proposals, and whichever board item you have selected. You do not re-explain the room to it.',
  },
  {
    title: 'It drafts. You still propose.',
    body: 'It can search the web, sketch a diagram, or rough out stickies. Nothing reaches the shared pinboard until you press Propose — and when you do, the proposal is authored by you.',
  },
];

function AssistantMock({ play }: { play: boolean }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!play || reduce) return;
    const timer = window.setInterval(() => {
      setShown((count) => {
        if (count >= REPLY.length) {
          window.clearInterval(timer);
          return count;
        }
        return count + 2;
      });
    }, 16);
    return () => window.clearInterval(timer);
  }, [play, reduce]);

  const visible = reduce ? REPLY : REPLY.slice(0, shown);
  const replyDone = reduce || visible.length >= REPLY.length;

  return (
    <div className="rt-landing-assistant-stage">
      <div className="rt-landing-board rt-landing-assistant-board" aria-hidden="true" />
      <div
        className="rt-assistant rt-landing-assistant is-open is-revealed"
        aria-hidden="true"
        {...{ inert: '' }}
      >
        <div className="rt-assistant-shell">
          <div className="rt-assistant-rail">
            <div className="rt-assistant-body">
              <header className="rt-assistant-header">
                <div className="min-w-0 flex-1">
                  <p className="rt-assistant-kicker">Assistant</p>
                  <p className="rt-assistant-meta">Private to you</p>
                </div>
                <span className="rt-assistant-icon-btn" aria-hidden="true">
                  <svg
                    viewBox="0 0 20 20"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                  </svg>
                </span>
              </header>

              <div className="rt-assistant-feed">
                <div className="flex justify-end">
                  <p className="rt-assistant-user">What are we missing on this question?</p>
                </div>
                <p className="rt-assistant-reply">
                  {visible}
                  {replyDone ? null : <span className="rt-caret ml-0.5">▍</span>}
                </p>
                {replyDone
                  ? DRAFTS.map((draft, index) => (
                      <motion.div
                        key={draft.text}
                        initial={reduce ? false : { y: 14, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{
                          delay: reduce ? 0 : 0.12 + index * 0.16,
                          duration: 0.42,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <ArtifactCard
                          artifact={{ type: 'sticky', text: draft.text, color: draft.color }}
                          propose="idle"
                          canPropose
                          onPropose={() => {}}
                        />
                      </motion.div>
                    ))
                  : null}
              </div>

              <div className="rt-assistant-composer">
                <div className="flex items-end gap-2">
                  <textarea
                    rows={1}
                    placeholder="Ask the assistant…"
                    disabled
                    readOnly
                    className="rt-assistant-input"
                    value=""
                  />
                  <button type="button" disabled className="rt-assistant-send">
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AssistantBeat() {
  const reduce = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const node = section.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPlay(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduce]);

  return (
    <section
      id="assistant"
      ref={section}
      className="scroll-mt-20 border-t border-rt-secondary/15 py-24"
    >
      <div className="mx-auto grid max-w-6xl items-start gap-14 px-6 lg:grid-cols-2 lg:gap-20">
        <div className="max-w-lg">
          <p className={eyebrow}>Optional assistant</p>
          <h2 className={sectionHeading}>It can draft ideas. It cannot post them.</h2>
          <p className={sectionBody}>
            Each person can open a private assistant that nobody else in the room can see. It is
            optional: if you never connect a key, the session still runs.
          </p>

          <dl className="mt-9 space-y-7">
            {POINTS.map((point) => (
              <div key={point.title}>
                <dt className="font-serif text-[17px] font-bold text-rt-ink">{point.title}</dt>
                <dd className="mt-1.5 text-[14.5px] leading-relaxed text-rt-ink-muted">
                  {point.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="lg:sticky lg:top-28">
          <AssistantMock play={reduce || play} />
        </div>
      </div>
    </section>
  );
}

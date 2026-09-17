import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

import { ProductFrame } from './ProductFrame';
import { LandingLobby, LobbyFooter } from './RoundTableScene';
import { DEMO, DEMO_QUESTIONS, DEMO_SEATS, DEMO_SHORTLIST } from './story';

const EASE = [0.22, 1, 0.36, 1] as const;

function AgendaScene({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  const last =
    DEMO_QUESTIONS[DEMO_QUESTIONS.length - 1]?.text ??
    'Who owns the laptop image and welcome kit?';
  const [typed, setTyped] = useState(reduce ? last.length : 0);

  useEffect(() => {
    if (reduce) {
      setTyped(last.length);
      return;
    }
    if (!active) return;

    const timer = window.setInterval(() => {
      setTyped((count) => {
        if (count >= last.length) {
          window.clearInterval(timer);
          return count;
        }
        return count + 1;
      });
    }, 22);
    return () => window.clearInterval(timer);
  }, [active, last.length, reduce]);

  return (
    <ProductFrame title="New session" meta="Draft — only you can see this yet" badge="Agenda">
      <div className="space-y-4 p-5">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
            Focus
          </p>
          <p className="mt-1.5 font-serif text-[16px] font-bold text-rt-ink">{DEMO.title}</p>
        </div>
        <ol className="space-y-2">
          {DEMO_QUESTIONS.map((question, index) => {
            const isLast = index === DEMO_QUESTIONS.length - 1;
            const text = isLast ? last.slice(0, typed) : question.text;
            return (
              <li
                key={question.text}
                className="flex gap-2.5 rounded-xl border border-rt-primary/40 bg-rt-primary/15 px-3 py-2.5 text-[12.5px] text-rt-ink"
              >
                <span className="font-semibold text-rt-ink-faint">{index + 1}.</span>
                <span className="flex-1">
                  {text}
                  {isLast && typed < last.length ? (
                    <span className="ml-0.5 inline-block h-3 w-[1.5px] translate-y-0.5 animate-pulse bg-rt-secondary-deep" />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </ProductFrame>
  );
}

function LobbyScene({ active: _active }: { active: boolean }) {
  return (
    <LandingLobby
      seats={DEMO_SEATS}
      stagger
      footer={<LobbyFooter status={`${DEMO_SEATS.length} of ${DEMO_SEATS.length} joined`} ready />}
    />
  );
}

function DiscussScene({ active: _active }: { active: boolean }) {
  const reduce = useReducedMotion();
  const notes = [
    { text: 'Provision accounts at offer stage', author: 'Mira', color: '#FDF1DC', rotate: -4 },
    {
      text: 'Seed the workspace so day one is never empty',
      author: 'Elena',
      color: '#E9F1F3',
      rotate: 3,
    },
  ];

  return (
    <ProductFrame title={DEMO.currentQuestion} meta="Voice is live" badge="Discussion">
      <div className="rt-landing-board relative h-[280px] overflow-hidden sm:h-[320px]">
        {notes.map((note, index) => (
          <motion.article
            key={note.text}
            initial={reduce ? false : { y: 28, rotate: note.rotate - 8 }}
            animate={{ y: 0, rotate: note.rotate }}
            transition={{ delay: 0.12 + index * 0.16, duration: 0.55, ease: EASE }}
            style={{ background: note.color }}
            className={`rt-landing-sticky absolute w-[44%] p-3 ${
              index === 0 ? 'top-[18%] left-[8%]' : 'top-[42%] right-[8%]'
            }`}
          >
            <p className="text-[12px] leading-snug font-medium text-rt-ink">{note.text}</p>
            <p className="mt-2 text-[10px] font-semibold tracking-[0.08em] text-rt-ink-faint uppercase">
              {note.author}
            </p>
          </motion.article>
        ))}
        <motion.p
          initial={reduce ? false : { y: 8 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-rt-secondary/20 bg-white/90 px-2.5 py-1 text-[10.5px] font-semibold text-rt-ink shadow-sm"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rt-cool" />
          Alex speaking
        </motion.p>
      </div>
    </ProductFrame>
  );
}

function VoteScene({ active: _active }: { active: boolean }) {
  const reduce = useReducedMotion();

  return (
    <ProductFrame title={DEMO.currentQuestion} meta="Shortlist · 3 of 7 proposals" badge="Voting">
      <ul className="space-y-2 p-4">
        {DEMO_SHORTLIST.map((option, index) => (
          <li
            key={option.text}
            className={`rounded-lg border p-3 ${
              option.winner
                ? 'border-rt-secondary/55 bg-rt-secondary/10'
                : 'border-rt-secondary/15 bg-white/70'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12px] leading-snug font-medium text-rt-ink">{option.text}</p>
              {option.winner ? (
                <span className="shrink-0 rounded-full bg-rt-secondary-deep px-2 py-0.5 text-[9px] font-bold tracking-[0.1em] text-white uppercase">
                  Answer
                </span>
              ) : null}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rt-secondary/15">
              <motion.div
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.15 + index * 0.12, duration: 0.6, ease: EASE }}
                style={{ width: `${option.share}%`, transformOrigin: '0 50%' }}
                className={`h-full rounded-full ${option.winner ? 'bg-rt-secondary-deep' : 'bg-rt-secondary/50'}`}
              />
            </div>
          </li>
        ))}
      </ul>
    </ProductFrame>
  );
}

function RecapScene({ active: _active }: { active: boolean }) {
  return (
    <ProductFrame title={DEMO.title} meta={`${DEMO_SEATS.length} people · ended`} badge="Recap">
      <ol className="divide-y divide-rt-secondary/12 px-5">
        {DEMO_QUESTIONS.map((row) => (
          <li key={row.text} className="py-3.5">
            <p className="text-[11.5px] leading-snug text-rt-ink-muted">{row.text}</p>
            <p className="mt-1.5 flex items-start gap-2 text-[13px] font-semibold text-rt-ink">
              <span
                aria-hidden="true"
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rt-secondary-deep"
              />
              {row.answer}
            </p>
          </li>
        ))}
      </ol>
    </ProductFrame>
  );
}

export const FILM_SCENES = [
  {
    title: 'Write the agenda',
    body: 'Create a session with a focus and an ordered list of questions. You are the leader for that session, and you can still edit the agenda until you start the room.',
    Visual: AgendaScene,
  },
  {
    title: 'Fill the lobby',
    body: 'Share the join code or link. People sit around the table as they arrive, voice is already on, and the session starts for everyone at the same moment.',
    Visual: LobbyScene,
  },
  {
    title: 'Talk, and put ideas on the board',
    body: 'Each question opens in discussion. Sticky notes, drawings and diagrams land on one shared pinboard. React to a proposal, or extend it into one of your own.',
    Visual: DiscussScene,
  },
  {
    title: 'Shortlist, then vote once',
    body: 'The leader picks the proposals worth deciding between. Everyone casts one private vote. When the last ballot is in, the winner is stored as that question’s answer.',
    Visual: VoteScene,
  },
  {
    title: 'Leave with the recap',
    body: 'End the session and voice disconnects. Every question is listed with the proposal that won it — or marked skipped — and it stays on the dashboard for the people who were there.',
    Visual: RecapScene,
  },
] as const;

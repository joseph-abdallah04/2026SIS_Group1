import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

import { LandingBallot } from './LandingBallot';
import { LandingRecap } from './LandingRecap';
import { LandingSticky } from './LandingSticky';
import { ProductFrame } from './ProductFrame';
import { LandingLobby, LobbyFooter } from './RoundTableScene';
import { DEMO, DEMO_PINBOARD_STICKIES, DEMO_QUESTIONS, DEMO_SEATS } from './story';

const EASE = [0.22, 1, 0.36, 1] as const;

function AgendaScene() {
  const reduce = useReducedMotion();
  const last =
    DEMO_QUESTIONS[DEMO_QUESTIONS.length - 1]?.text ?? 'Who owns the laptop image and welcome kit?';
  const [typed, setTyped] = useState(reduce ? last.length : 0);

  useEffect(() => {
    if (reduce) {
      setTyped(last.length);
      return;
    }

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
  }, [last.length, reduce]);

  return (
    <ProductFrame title="New session" meta="Draft — only you can see this yet" badge="Agenda">
      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-rt-ink">Focus / title</p>
          <p className="flex min-h-10 items-center rounded-full border border-rt-tertiary bg-rt-surface px-3 text-[13px] text-rt-ink">
            {DEMO.title}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-rt-ink">Questions (in order)</p>
          <ol className="flex flex-col gap-2">
            {DEMO_QUESTIONS.map((question, index) => {
              const isLast = index === DEMO_QUESTIONS.length - 1;
              const text = isLast ? last.slice(0, typed) : question.text;
              return (
                <li key={question.text} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-[12px] font-semibold text-rt-ink-faint">
                    {index + 1}.
                  </span>
                  <span className="flex min-h-10 flex-1 items-center rounded-full border border-rt-tertiary bg-rt-surface px-3 text-[13px] text-rt-ink">
                    {text}
                    {isLast && typed < last.length ? (
                      <span className="ml-0.5 inline-block h-3 w-[1.5px] animate-pulse bg-rt-secondary-deep" />
                    ) : null}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-rt-ink-muted"
                  >
                    ↑
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-rt-ink-muted"
                  >
                    ↓
                  </span>
                </li>
              );
            })}
          </ol>
          <span className="inline-flex min-h-10 w-fit items-center rounded-full border border-rt-tertiary bg-rt-surface px-4 text-[13px] font-semibold text-rt-ink">
            + Add question
          </span>
        </div>
      </div>
    </ProductFrame>
  );
}

function LobbyScene() {
  return (
    <LandingLobby
      seats={DEMO_SEATS}
      stagger
      footer={<LobbyFooter status={`${DEMO_SEATS.length} of ${DEMO_SEATS.length} joined`} ready />}
    />
  );
}

function DiscussScene() {
  const reduce = useReducedMotion();
  const notes = DEMO_PINBOARD_STICKIES.slice(0, 2);

  return (
    <ProductFrame title={DEMO.currentQuestion} meta="The call is live" badge="Discussion">
      <div
        className="rt-landing-board relative h-[280px] overflow-hidden sm:h-[320px]"
        aria-hidden="true"
        {...{ inert: '' }}
      >
        {notes.map((item, index) => (
          <motion.div
            key={item.id}
            initial={reduce ? false : { y: 28, rotate: index === 0 ? -12 : 11 }}
            animate={{ y: 0, rotate: index === 0 ? -4 : 3 }}
            transition={{ delay: 0.12 + index * 0.16, duration: 0.55, ease: EASE }}
            className={`absolute origin-top-left scale-[0.55] ${
              index === 0 ? 'top-[14%] left-[6%]' : 'top-[34%] left-[42%]'
            }`}
          >
            <LandingSticky item={item} isAuthorLeader={item.authorId === 'mira'} />
          </motion.div>
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

function VoteScene() {
  return <LandingBallot compact />;
}

function RecapScene() {
  return <LandingRecap compact />;
}

export const FILM_SCENES = [
  {
    title: 'Write the agenda',
    body: 'Create a session with a focus and an ordered list of questions. You are the leader for that session, and you can extend the agenda at any point.',
    Visual: AgendaScene,
  },
  {
    title: 'Fill the lobby',
    body: 'Share the join code or link. People sit around the table as they arrive, the call is already on, and the session starts for everyone at the same moment.',
    Visual: LobbyScene,
  },
  {
    title: 'Talk, and put ideas on the board',
    body: 'Each question opens in discussion. Sticky notes, drawings and diagrams land on one shared pinboard. React to a proposal, or extend it into one of your own.',
    Visual: DiscussScene,
  },
  {
    title: 'Shortlist, then vote once',
    body: 'The leader picks the proposals worth deciding between. Everyone casts one private vote and can change it until the leader ends the round — or the timer does. Then the winner is stored as that question’s answer.',
    Visual: VoteScene,
  },
  {
    title: 'Leave with the recap',
    body: 'End the session and the call disconnects. Every question is listed with the proposal that won it — or marked skipped — and it stays on the dashboard for the people who were there.',
    Visual: RecapScene,
  },
] as const;

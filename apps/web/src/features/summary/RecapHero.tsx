import { useId, useRef, useState } from 'react';
import { ChevronDown, PartyPopper } from 'lucide-react';
import { recapQuestionOutcome, RECAP_OUTCOME_LABEL, type SessionRecap } from '@roundtable/shared';

import { Popover } from '../../components/ui/Popover';
import { FactLine } from '../sessions/setup/FactLine';
import { countsLine, meetingFacts, orderedPeople, outcomeCounts, peopleLine } from './recapModel';
import { Avatar, SEGMENT_CLASS } from './recapUi';

/** Faces shown before the rest are counted ("+9"). */
const FACES = 5;

/**
 * Who took part, as faces: the leader first, then you, then everyone else.
 * The whole list opens from it, so a big team costs one line, not a screen.
 */
function PeopleStack({ summary, viewerId }: { summary: SessionRecap; viewerId: string | null }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const people = orderedPeople(summary.participants, viewerId);
  if (people.length === 0) return null;
  const shown = people.slice(0, FACES);
  const more = people.length - shown.length;

  return (
    // Its own width, wrapping under the track rather than squeezing the names.
    <div className="relative -ml-1 max-w-full flex-none">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className="flex max-w-full cursor-pointer items-center gap-2.5 rounded-full py-1 pr-2.5 pl-1 text-left text-[12.5px] text-rt-ink-muted transition-colors hover:bg-rt-surface-alt focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none aria-expanded:bg-rt-surface-alt"
      >
        <span className="flex shrink-0 -space-x-1.5">
          {shown.map(({ person, key }) => (
            <Avatar key={key} person={person} />
          ))}
          {more > 0 ? (
            <span
              aria-hidden
              className="flex size-7 items-center justify-center rounded-full bg-rt-surface-alt text-[10.5px] font-semibold text-rt-ink-muted ring-2 ring-rt-surface"
            >
              +{more}
            </span>
          ) : null}
        </span>
        <span className="min-w-0 truncate">
          <span className="sr-only">Who took part: </span>
          <span className="font-semibold text-rt-ink">{peopleLine(people)}</span>
        </span>
        <ChevronDown aria-hidden size={14} className="shrink-0" />
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        label="Who took part"
        placement="bottom"
        width="min(18rem, calc(100vw - 2rem))"
        triggerRef={triggerRef}
      >
        <div
          id={listId}
          className="flex max-h-80 flex-col overflow-y-auto overscroll-contain p-1.5"
        >
          <p className="px-2 pt-1.5 pb-1 text-[11px] font-bold tracking-[0.1em] text-rt-ink-muted uppercase">
            {people.length} took part
          </p>
          <ul className="flex flex-col">
            {people.map(({ person, key, isViewer }) => (
              <li
                key={key}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px]"
              >
                <Avatar person={person} size="sm" />
                <span className="min-w-0 flex-1 truncate">{person.displayName}</span>
                {person.isLeader ? (
                  <span className="shrink-0 rounded-full bg-rt-secondary-wash px-2 text-[10.5px] font-semibold text-rt-secondary-deep">
                    Leader
                  </span>
                ) : null}
                {isViewer ? (
                  <span className="shrink-0 rounded-full border border-rt-tertiary px-2 text-[10.5px] font-semibold text-rt-ink-muted">
                    You
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </Popover>
    </div>
  );
}

/** How it went, question by question: one segment each, coloured by what became of it. */
function OutcomeTrack({ summary }: { summary: SessionRecap }) {
  const total = summary.questions.length;
  if (total === 0) return null;
  const counts = outcomeCounts(summary.questions);
  const line = countsLine(counts);
  return (
    <div
      role="img"
      aria-label={`${line}, of ${total} ${total === 1 ? 'question' : 'questions'}`}
      className="flex w-full max-w-md min-w-0 flex-col gap-2"
    >
      <div aria-hidden className="flex items-baseline gap-3 text-[12.5px] text-rt-ink-muted">
        <span className="min-w-0">{line}</span>
        <span className="ml-auto hidden shrink-0 tabular-nums sm:inline">
          {total} {total === 1 ? 'question' : 'questions'}
        </span>
      </div>
      <div
        aria-hidden
        className={`flex h-1.5 ${total > 16 ? 'overflow-hidden rounded-full' : 'gap-1'}`}
      >
        {summary.questions.map((question, index) => {
          const kind = recapQuestionOutcome(question).kind;
          return (
            <span
              key={question.id}
              title={`${index + 1}. ${RECAP_OUTCOME_LABEL[kind]}`}
              className={`rt-recap-seg min-w-0 flex-1 ${total > 16 ? '' : 'rounded-full'} ${SEGMENT_CLASS[kind]}`}
              style={{ ['--rt-recap-i' as string]: index }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** The board's own colours: sticky papers, the amber and the blue-grey. */
const CONFETTI_COLOURS = [
  '#e0a33c',
  '#f1c881',
  '#8ca4ac',
  '#4d6a74',
  '#f3d6df',
  '#cfe3d6',
  '#c17b4a',
];

/**
 * A short fall of paper over the top of the page, the moment a meeting ends
 * in front of someone. Laid out from fixed steps rather than at random, so it
 * falls the same way every time and a test can count it. Decoration only:
 * hidden from assistive tech, and not drawn where less motion is asked for.
 */
function Confetti() {
  return (
    <div
      aria-hidden
      className="rt-recap-confetti pointer-events-none absolute inset-x-0 -top-10 h-[26rem] overflow-hidden"
    >
      {Array.from({ length: 42 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
            borderRadius: i % 3 === 0 ? '50%' : '1px',
            ['--rt-x' as string]: `${((i * 53) % 120) - 60}px`,
            ['--rt-r' as string]: `${((i * 97) % 540) - 270}deg`,
            animationDelay: `${((i * 29) % 60) / 100}s`,
            animationDuration: `${1.3 + ((i * 17) % 50) / 100}s`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The top of the summary (I1): what the meeting was, when, who was there and
 * how it went, in the dashboard's language — the eyebrow, the title in Lora,
 * one quiet line of facts, the faces and the progress track.
 */
export function RecapHero({
  summary,
  viewerId,
  voiceEnabled,
  justEnded = false,
}: {
  summary: SessionRecap;
  viewerId: string | null;
  voiceEnabled?: boolean;
  /** The meeting just ended in front of this viewer: "That's a wrap", once. */
  justEnded?: boolean;
}) {
  const { day, facts } = meetingFacts(summary, { viewerId, voiceEnabled });
  return (
    <div className="rt-recap-rise relative flex flex-col gap-2.5">
      {justEnded ? (
        <>
          <Confetti />
          <p className="mb-1 inline-flex h-7 items-center gap-2 self-start rounded-full border border-rt-secondary/50 bg-rt-secondary-wash pr-3 pl-2 text-[12.5px] font-semibold text-rt-secondary-deep">
            <PartyPopper aria-hidden size={15} className="text-rt-secondary" />
            That’s a wrap. The meeting just ended.
          </p>
        </>
      ) : null}
      <p className="text-[11px] font-bold tracking-[0.12em] text-rt-secondary-deep uppercase">
        Session recap · {day}
      </p>
      <h1 className="font-serif text-[30px] leading-[1.12] font-normal tracking-[-0.02em] text-balance break-words text-rt-ink sm:text-[40px]">
        {summary.title}
      </h1>
      {facts.length > 0 ? <FactLine facts={facts} className="text-[13px]" /> : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-8 gap-y-3">
        <PeopleStack summary={summary} viewerId={viewerId} />
        <div className="flex min-w-[min(100%,16rem)] flex-1">
          <OutcomeTrack summary={summary} />
        </div>
      </div>
    </div>
  );
}

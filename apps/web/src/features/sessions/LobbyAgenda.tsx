import { useId } from 'react';
import { Clock, Lightbulb } from 'lucide-react';
import type { Question } from '@roundtable/shared';

import { AgendaChip, StepNode } from '../agenda/AgendaTimeline';

interface LobbyAgendaProps {
  questions: readonly Question[];
  discussionTimerSeconds: number | null;
  votingTimerSeconds: number | null;
}

/**
 * Roughly how long the agenda runs at the session's clocks: every question's
 * discussion, and a vote for each one that has one. Null without a discussion
 * clock, when there is nothing honest to add up.
 */
export function agendaMinutes(
  questions: readonly Pick<Question, 'votingEnabled'>[],
  discussionTimerSeconds: number | null,
  votingTimerSeconds: number | null,
): number | null {
  if (!discussionTimerSeconds || questions.length === 0) return null;
  const votes = questions.filter((question) => question.votingEnabled).length;
  const seconds = questions.length * discussionTimerSeconds + votes * (votingTimerSeconds ?? 0);
  return Math.max(1, Math.round(seconds / 60));
}

/**
 * The questions ahead, drawn as the board's agenda draws them: numbered steps
 * on a line, the first marked as up first, and a brainstorm question (no vote)
 * marked as one. People see the same agenda before and after Start.
 */
export function LobbyAgenda({
  questions,
  discussionTimerSeconds,
  votingTimerSeconds,
}: LobbyAgendaProps) {
  const minutes = agendaMinutes(questions, discussionTimerSeconds, votingTimerSeconds);
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="rt-lobby-panel">
      <h2
        id={headingId}
        className="text-[10px] font-semibold tracking-[0.16em] text-rt-ink-faint uppercase"
      >
        Questions ahead{' '}
        <span className="ml-0.5 tracking-[0.04em] text-rt-ink-muted tabular-nums">
          {questions.length}
        </span>
      </h2>
      {questions.length === 0 ? (
        <p className="mt-3 text-[13px] text-rt-ink-muted">No questions yet.</p>
      ) : (
        <ol className="relative mt-3 before:absolute before:top-3.5 before:bottom-3.5 before:left-[9.5px] before:w-px before:bg-[#ddd6c8]">
          {questions.map((question, index) => (
            <li key={question.id} className="flex gap-2.75 py-1.75">
              <StepNode state="pending" number={index + 1} />
              <div className="min-w-0">
                {index === 0 ? (
                  <span className="mb-0.5 block text-[10px] font-semibold tracking-[0.14em] text-rt-ink-faint uppercase">
                    Up first
                  </span>
                ) : null}
                <p className="text-[13px] leading-[1.42] text-rt-ink">{question.text}</p>
                {question.votingEnabled ? null : (
                  <span className="mt-1.5 inline-flex">
                    <AgendaChip
                      tone="outline"
                      icon={<Lightbulb aria-hidden size={11} strokeWidth={2.25} />}
                    >
                      Brainstorm
                    </AgendaChip>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {minutes !== null ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-rt-ink-faint">
          <Clock aria-hidden="true" size={13} strokeWidth={1.8} />
          About {minutes} min at the set timers
        </p>
      ) : null}
    </section>
  );
}

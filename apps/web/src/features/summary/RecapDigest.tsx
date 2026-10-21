import { ChevronRight } from 'lucide-react';
import { recapQuestionOutcome, type SessionRecap } from '@roundtable/shared';

import { answerLine, outcomeCounts } from './recapModel';
import { OutcomeChip, QuestionNumber } from './recapUi';

/** The id of a question's card, for "At a glance" to jump to. */
export function questionAnchor(questionId: string): string {
  return `recap-q-${questionId}`;
}

function prefersLessMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : true;
}

/**
 * Brings a question's card into view, moves focus to it so the keyboard
 * carries on from there, and lights it briefly so the eye finds it.
 */
export function jumpToQuestion(questionId: string) {
  const card = document.getElementById(questionAnchor(questionId));
  if (!card) return;
  card.scrollIntoView?.({ behavior: prefersLessMotion() ? 'auto' : 'smooth', block: 'start' });
  card.focus({ preventScroll: true });
  card.classList.remove('rt-recap-flash');
  // Read the layout so taking the class off and putting it back restarts it.
  void card.offsetWidth;
  card.classList.add('rt-recap-flash');
}

/**
 * "At a glance" (L1): every question and what became of it, one line each,
 * and the way to its card. The page's contents as well as its summary, so a
 * long meeting is read here first and the detail only where it matters.
 */
export function RecapDigest({
  summary,
  viewerId,
}: {
  summary: SessionRecap;
  viewerId: string | null;
}) {
  if (summary.questions.length === 0) return null;
  const decided = outcomeCounts(summary.questions).decided;
  return (
    <section
      aria-labelledby="recap-glance"
      className="rt-recap-rise flex flex-col gap-3"
      style={{ ['--rt-recap-i' as string]: 1 }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="recap-glance" className="mr-auto text-[19px] font-semibold tracking-[-0.01em]">
          At a glance
        </h2>
        <p className="text-[12.5px] text-rt-ink-muted">
          {decided} of {summary.questions.length} decided
        </p>
      </div>
      <ol className="@container flex flex-col rounded-3xl border border-rt-tertiary/70 bg-rt-surface p-1.5 sm:p-2">
        {summary.questions.map((question, index) => {
          const kind = recapQuestionOutcome(question).kind;
          return (
            <li
              key={question.id}
              className="border-b border-rt-tertiary/50 last:border-b-0 has-[+li:hover]:border-transparent hover:border-transparent"
            >
              <button
                type="button"
                onClick={() => jumpToQuestion(question.id)}
                className="grid w-full cursor-pointer grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-2xl px-2.5 py-3 text-left text-[13px] transition-colors hover:bg-rt-surface-alt focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none @2xl:grid-cols-[1.5rem_minmax(0,1fr)_8.5rem_minmax(0,1.2fr)_1rem] @2xl:items-center @2xl:px-3.5"
              >
                <QuestionNumber n={index + 1} kind={kind} />
                <span className="min-w-0 font-semibold text-rt-ink @2xl:truncate">
                  {question.text}
                </span>
                <span className="justify-self-end @2xl:justify-self-start">
                  <OutcomeChip kind={kind} />
                </span>
                <span className="col-start-2 col-end-4 min-w-0 truncate text-rt-ink-muted @2xl:col-auto">
                  {answerLine(question, viewerId)}
                </span>
                <ChevronRight
                  aria-hidden
                  size={15}
                  className="hidden text-rt-ink-faint @2xl:block"
                />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

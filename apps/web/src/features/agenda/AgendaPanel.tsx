import { useState } from 'react';
import type { Question, QuestionStatus } from '@roundtable/shared';

import { useFocusQuestion } from '../sessions/useFocusQuestion';
import { useSetQuestionPhase, type QuestionPhaseTarget } from '../sessions/useSetQuestionPhase';

interface AgendaPanelProps {
  sessionId: string;
  questions: Question[];
  /** The question the board is showing, from the server (`getActiveQuestion`). */
  activeQuestionId: string | null;
  /** Only the leader gets the phase controls (F25/F26); everyone sees the list. */
  isLeader: boolean;
}

/**
 * The next step the leader can take from each status, and what to call it.
 *
 * A subset of the server's transition table (`setQuestionPhase`) on purpose:
 * this offers the one forward move that makes sense as a button, while the
 * server owns what is *legal*. `answered` and `skipped` are absent because
 * they are terminal, so a finished question shows no controls at all.
 */
const NEXT_PHASE: Partial<Record<QuestionStatus, { status: QuestionPhaseTarget; label: string }>> =
  {
    pending: { status: 'discussion', label: 'Start discussion' },
    discussion: { status: 'voting', label: 'Open voting' },
    voting: { status: 'answered', label: 'Mark answered' },
  };

function isComplete(status: QuestionStatus): boolean {
  return status === 'answered' || status === 'skipped';
}

function statusLabel(status: QuestionStatus): string | null {
  switch (status) {
    case 'discussion':
      return 'Discussing';
    case 'voting':
      return 'Voting';
    case 'answered':
      return 'Answered';
    case 'skipped':
      return 'Skipped';
    default:
      return null;
  }
}

/**
 * F24: the ordered question list beside the board, with F25/F26's leader
 * controls. The leader can click a finished question to put that question's
 * pinboard back on screen without reopening it.
 *
 * Collapse state is local to each participant — the leader collapsing their
 * rail is not an instruction to everyone else.
 */
export function AgendaPanel({
  sessionId,
  questions,
  activeQuestionId,
  isLeader,
}: AgendaPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [confirmingSkip, setConfirmingSkip] = useState<string | null>(null);
  const {
    setPhase,
    busyQuestionId: phaseBusyId,
    error: phaseError,
  } = useSetQuestionPhase(sessionId);
  const { focus, error: focusError } = useFocusQuestion(sessionId);

  const activeIndex = questions.findIndex((question) => question.id === activeQuestionId);
  const position = activeIndex >= 0 ? `${activeIndex + 1}/${questions.length}` : null;
  const allDone = questions.length > 0 && questions.every((q) => isComplete(q.status));
  const openQuestion = questions.find(
    (question) => question.status === 'discussion' || question.status === 'voting',
  );
  const firstPending = questions.find((question) => question.status === 'pending');
  const error = phaseError ?? focusError;

  if (collapsed) {
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center gap-3 border-r border-rt-tertiary bg-rt-surface-alt py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-expanded={false}
          aria-label="Expand agenda"
          title="Expand agenda"
          className="text-[13px] font-semibold text-rt-primary-deep hover:opacity-70"
        >
          ›
        </button>
        <span
          className="text-[10px] font-semibold tracking-[0.16em] text-rt-ink-faint uppercase"
          style={{ writingMode: 'vertical-rl' }}
        >
          Agenda {position ?? ''}
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-rt-tertiary bg-rt-surface-alt">
      <div className="flex shrink-0 items-center justify-between border-b border-rt-tertiary px-3 py-2">
        <span className="text-[10px] font-semibold tracking-[0.16em] text-rt-ink-faint uppercase">
          Agenda {position ?? ''}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-expanded={true}
          aria-label="Collapse agenda"
          title="Collapse agenda"
          className="text-[13px] font-semibold text-rt-primary-deep hover:opacity-70"
        >
          ‹
        </button>
      </div>

      {questions.length === 0 ? (
        <p className="px-3 py-3 text-[12px] text-rt-ink-muted">No questions on the agenda.</p>
      ) : (
        <ol className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          {questions.map((question, index) => {
            const isFocused = question.id === activeQuestionId;
            const label = statusLabel(question.status);
            const next = NEXT_PHASE[question.status];
            // Phase controls stay on the question that is actually open, even
            // while the board is looking back at an earlier one. Pending gets
            // "Start discussion" only when nothing is open, on the next one.
            const showControls =
              isLeader &&
              next !== undefined &&
              (openQuestion
                ? question.id === openQuestion.id
                : firstPending !== undefined && question.id === firstPending.id);
            const busy = phaseBusyId === question.id;

            return (
              <li
                key={question.id}
                aria-current={isFocused ? 'step' : undefined}
                className={`rounded-md border px-2.5 py-2 ${
                  isFocused
                    ? 'border-rt-secondary bg-white shadow-sm'
                    : 'border-transparent bg-transparent'
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className={`w-4 shrink-0 text-center text-[11px] font-semibold ${
                      question.status === 'answered'
                        ? 'text-rt-primary-deep'
                        : isFocused
                          ? 'text-rt-primary-deep'
                          : 'text-rt-ink-faint'
                    }`}
                    aria-hidden
                  >
                    {question.status === 'answered' ? '✓' : index + 1}
                  </span>
                  {isLeader ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!isFocused) void focus(question.id);
                      }}
                      className={`text-left text-[12.5px] leading-snug hover:underline ${
                        question.status === 'skipped'
                          ? 'text-rt-ink-faint line-through'
                          : isFocused
                            ? 'font-medium text-rt-ink'
                            : 'text-rt-ink-muted'
                      }`}
                    >
                      {question.text}
                    </button>
                  ) : (
                    <p
                      className={`text-[12.5px] leading-snug ${
                        question.status === 'skipped'
                          ? 'text-rt-ink-faint line-through'
                          : isFocused
                            ? 'font-medium text-rt-ink'
                            : 'text-rt-ink-muted'
                      }`}
                    >
                      {question.text}
                    </p>
                  )}
                </div>

                {label && (
                  <span className="mt-1 ml-[18px] block text-[10px] font-semibold tracking-[0.08em] text-rt-ink-faint uppercase">
                    {label}
                  </span>
                )}

                {showControls && next && (
                  <div className="mt-2 ml-[18px] flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => void setPhase(question.id, next.status)}
                      disabled={busy}
                      className="self-start rounded-full bg-rt-secondary px-3 py-[5px] text-[11px] font-semibold text-rt-ink hover:bg-rt-secondary-deep hover:text-white disabled:opacity-60 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-secondary"
                    >
                      {busy ? 'Working…' : next.label}
                    </button>

                    {confirmingSkip === question.id ? (
                      <span className="flex items-center gap-2 text-[11px]">
                        <span className="text-rt-ink-muted">Skip it?</span>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmingSkip(null);
                            void setPhase(question.id, 'skipped');
                          }}
                          disabled={busy}
                          className="font-semibold text-rt-primary-deep hover:underline"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingSkip(null)}
                          className="text-rt-ink-muted hover:underline"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingSkip(question.id)}
                        className="self-start text-[11px] font-medium text-rt-ink-muted hover:underline"
                      >
                        Skip question
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {error && (
        <p className="shrink-0 border-t border-rt-tertiary px-3 py-2 text-[11px] text-red-600">
          {error}
        </p>
      )}

      {allDone && (
        <p className="shrink-0 border-t border-rt-tertiary px-3 py-2 text-[11px] text-rt-ink-muted">
          {isLeader
            ? 'Every question is done — end the session when you’re ready.'
            : 'Every question is done.'}
        </p>
      )}
    </aside>
  );
}

import { useState } from 'react';
import type { Question, QuestionStatus } from '@roundtable/shared';

interface AgendaPanelProps {
  /** The leader's ordered question list from F04, as stored. */
  questions: Question[];
  /**
   * The question the board is currently showing, straight from the board
   * response — so the panel and the board header can never disagree about
   * where the session is.
   */
  activeQuestionId: string | null;
}

/** Done means done: `answered` and `skipped` are both behind us (F26 skips). */
function isComplete(status: QuestionStatus): boolean {
  return status === 'answered' || status === 'skipped';
}

function statusLabel(status: QuestionStatus): string | null {
  switch (status) {
    case 'answered':
      return 'Answered';
    case 'skipped':
      return 'Skipped';
    case 'voting':
      return 'Voting';
    default:
      // `pending` and `discussion` say nothing useful next to the current-item
      // highlight, which already communicates both.
      return null;
  }
}

/**
 * F24: the slim agenda rail beside the board, so nobody has to ask where in
 * the session they are.
 *
 * Collapse state is local `useState` on purpose — the ticket asks for
 * collapsing to affect nobody else, so this is one of the few pieces of
 * session UI that is deliberately not shared state.
 *
 * The list re-renders from `activeQuestionId`, which comes from the same board
 * snapshot the socket refreshes (`usePinboard`'s `sessionState`). So when F25
 * lands and the leader advances the question, this panel follows from the
 * broadcast with no change here — what is missing today is anything that
 * *moves* the question, not the plumbing that reflects it.
 */
export function AgendaPanel({ questions, activeQuestionId }: AgendaPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const activeIndex = questions.findIndex((question) => question.id === activeQuestionId);
  const position = activeIndex >= 0 ? `${activeIndex + 1}/${questions.length}` : null;

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
          className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rt-ink-faint"
          style={{ writingMode: 'vertical-rl' }}
        >
          Agenda {position ?? ''}
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-rt-tertiary bg-rt-surface-alt">
      <div className="flex shrink-0 items-center justify-between border-b border-rt-tertiary px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rt-ink-faint">
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
            const isCurrent = question.id === activeQuestionId;
            const complete = isComplete(question.status);
            const label = statusLabel(question.status);

            return (
              <li
                key={question.id}
                aria-current={isCurrent ? 'step' : undefined}
                className={`rounded-md border px-2.5 py-2 ${
                  isCurrent
                    ? 'border-rt-primary bg-white shadow-sm'
                    : 'border-transparent bg-transparent'
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-[11px] font-semibold ${
                      isCurrent ? 'text-rt-primary-deep' : 'text-rt-ink-faint'
                    }`}
                  >
                    {complete ? '✓' : index + 1}
                  </span>
                  <p
                    className={`text-[12.5px] leading-snug ${
                      complete
                        ? 'text-rt-ink-faint line-through'
                        : isCurrent
                          ? 'font-medium text-rt-ink'
                          : 'text-rt-ink-muted'
                    }`}
                  >
                    {question.text}
                  </p>
                </div>
                {label && (
                  <span className="mt-1 ml-[18px] block text-[10px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
                    {label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

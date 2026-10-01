import { useState } from 'react';
import type { Question, QuestionStatus } from '@roundtable/shared';

import { BoardRail } from '../../components/BoardRail';

const STATUS_LABEL: Record<QuestionStatus, string | null> = {
  pending: null,
  discussion: 'Not voted on',
  voting: 'Voting',
  answered: 'Answered',
  skipped: 'Skipped',
};

interface ArchiveQuestionListProps {
  questions: Question[];
  activeQuestionId: string | null;
  onSelect: (questionId: string) => void;
}

/**
 * The ended session's agenda. Every participant can open any question. There
 * are no phase, skip, or add controls: those would write, and this list does not.
 */
export function ArchiveQuestionList({
  questions,
  activeQuestionId,
  onSelect,
}: ArchiveQuestionListProps) {
  const [collapsed, setCollapsed] = useState(false);
  const activeIndex = questions.findIndex((question) => question.id === activeQuestionId);
  const position = activeIndex >= 0 ? `${activeIndex + 1}/${questions.length}` : null;

  return (
    <BoardRail
      side="left"
      title={`Questions ${position ?? ''}`}
      collapsed={collapsed}
      onToggle={() => setCollapsed((open) => !open)}
      expandLabel="Expand questions"
      collapseLabel="Collapse questions"
    >
      {questions.length === 0 ? (
        <p className="py-3 text-[12px] text-rt-ink-muted">No questions in this session.</p>
      ) : (
        <ol className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-2">
          {questions.map((question, index) => {
            const isFocused = question.id === activeQuestionId;
            const label = STATUS_LABEL[question.status];
            return (
              <li
                key={question.id}
                className={`rounded-2xl border px-2.5 py-2 ${
                  isFocused
                    ? 'border-rt-secondary bg-white shadow-sm'
                    : 'border-transparent bg-transparent'
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className={`w-4 shrink-0 text-center text-[11px] font-semibold ${
                      isFocused ? 'text-rt-primary-deep' : 'text-rt-ink-faint'
                    }`}
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    aria-current={isFocused ? 'step' : undefined}
                    onClick={() => {
                      if (!isFocused) onSelect(question.id);
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
                </div>
                {label ? (
                  <span className="mt-1 ml-[18px] block text-[10px] font-semibold tracking-[0.08em] text-rt-ink-faint uppercase">
                    {label}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </BoardRail>
  );
}

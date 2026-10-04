import { useState } from 'react';
import type { Question, QuestionStatus } from '@roundtable/shared';

import { BoardRail } from '../../components/BoardRail';
import { AgendaProgress } from '../agenda/AgendaProgress';
import { AgendaStep, AgendaTimeline, type AgendaChipTone } from '../agenda/AgendaTimeline';
import { stepState, summarizeAgenda } from '../agenda/agendaSummary';

/**
 * What became of each question, in the past tense the session ended in. The
 * session is over, so nothing reads as in play: a question left open was
 * simply not finished.
 */
const STATUS_CHIP: Record<QuestionStatus, { label: string; tone: AgendaChipTone }> = {
  pending: { label: 'Not reached', tone: 'neutral' },
  discussion: { label: 'Not voted on', tone: 'neutral' },
  voting: { label: 'Voting', tone: 'neutral' },
  answered: { label: 'Answered', tone: 'warm' },
  skipped: { label: 'Skipped', tone: 'neutral' },
};

/**
 * F41: a brainstorm-only question was never going to be voted on, so
 * "Answered" or "Not voted on" would misdescribe it. Finished, or left
 * mid-discussion when the session ended, the team discussed it — which is
 * also how its node and the progress count read it (`stepState`).
 */
function statusChip(question: Question): { label: string; tone: AgendaChipTone } {
  if (
    !question.votingEnabled &&
    (question.status === 'answered' || question.status === 'discussion')
  ) {
    return { label: 'Discussed', tone: 'warm' };
  }
  return STATUS_CHIP[question.status];
}

/** The live agenda's storage key, so the rail keeps one width across both. */
const QUESTIONS_RESIZE = { storageKey: 'agenda', label: 'Resize questions' };

interface ArchiveQuestionListProps {
  questions: Question[];
  activeQuestionId: string | null;
  onSelect: (questionId: string) => void;
}

/**
 * The ended session's agenda, on the same timeline and progress track as the
 * live one. Every participant can open any question. There are no phase,
 * skip, or add controls: those would write, and this list does not.
 */
export function ArchiveQuestionList({
  questions,
  activeQuestionId,
  onSelect,
}: ArchiveQuestionListProps) {
  const [collapsed, setCollapsed] = useState(false);
  const summary = summarizeAgenda(questions, { ended: true });

  return (
    <BoardRail
      side="left"
      title="Questions"
      collapsed={collapsed}
      onToggle={() => setCollapsed((open) => !open)}
      expandLabel="Expand questions"
      collapseLabel="Collapse questions"
      collapsedExtra={<AgendaProgress summary={summary} vertical />}
      resize={QUESTIONS_RESIZE}
    >
      {questions.length === 0 ? (
        <p className="py-3 text-[12px] text-rt-ink-muted">No questions in this session.</p>
      ) : (
        <>
          <AgendaProgress summary={summary} />
          <AgendaTimeline>
            {questions.map((question, index) => {
              const isFocused = question.id === activeQuestionId;
              return (
                <AgendaStep
                  key={question.id}
                  number={index + 1}
                  text={question.text}
                  state={stepState(question.status, true, question.votingEnabled)}
                  focused={isFocused}
                  last={index === questions.length - 1}
                  onSelect={() => {
                    if (!isFocused) onSelect(question.id);
                  }}
                  status={statusChip(question)}
                />
              );
            })}
          </AgendaTimeline>
        </>
      )}
    </BoardRail>
  );
}

import type { Question, QuestionStatus } from '@roundtable/shared';

/**
 * What one question contributes to the agenda's progress, in agenda order.
 *
 * `live` is the question the room is working on: being discussed or voted on.
 * In an ended session nothing is live any more, and a question that was left
 * open simply was not finished, so it counts as `pending`.
 */
export type AgendaStepState = 'answered' | 'skipped' | 'live' | 'pending';

export interface AgendaSummary {
  answered: number;
  skipped: number;
  /** Answered or skipped: nothing more will happen to it. */
  done: number;
  total: number;
  steps: AgendaStepState[];
}

/** Past this many questions a segment each gets too thin to read as one. */
export const SEGMENTED_MAX = 16;

export function stepState(status: QuestionStatus, ended = false): AgendaStepState {
  switch (status) {
    case 'answered':
      return 'answered';
    case 'skipped':
      return 'skipped';
    case 'discussion':
    case 'voting':
      return ended ? 'pending' : 'live';
    default:
      return 'pending';
  }
}

/**
 * How far through the agenda the session is: finished questions over all of
 * them. Not the position of the question on screen, which is where the board
 * happens to be looking — the leader can put an earlier question back up
 * without the session going backwards.
 */
export function summarizeAgenda(questions: Question[], { ended = false } = {}): AgendaSummary {
  const steps = questions.map((question) => stepState(question.status, ended));
  const answered = steps.filter((step) => step === 'answered').length;
  const skipped = steps.filter((step) => step === 'skipped').length;
  return { answered, skipped, done: answered + skipped, total: steps.length, steps };
}

/** "2 of 4 questions done, 1 skipped", for assistive tech. */
export function progressText({ done, skipped, total }: AgendaSummary): string {
  const base = `${done} of ${total} ${total === 1 ? 'question' : 'questions'} done`;
  return skipped > 0 ? `${base}, ${skipped} skipped` : base;
}

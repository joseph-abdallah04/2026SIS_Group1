// Temporary adapter over the `sessions` module.
//
// docs/02 §2: a module never queries another module's tables. The `sessions`
// module does not exist yet, so this file stands in for its public surface —
// and it is the ONLY file in `pinboard/` allowed to read `sessions`/`questions`
// rows. Everything else in this module goes through the two functions below.
//
// When the Session Lifecycle owner lands their module, this file collapses to:
//   export { getSession, getActiveQuestion } from '../sessions/index.js';
// and no other pinboard file changes.
import { prisma } from '../../db.js';
import type { QuestionStatus } from '@roundtable/shared';

export interface SessionRef {
  id: string;
  title: string;
  /**
   * Who runs this session. Leadership is per-session, not a user role
   * (docs/00 personas), so it can only ever be answered against a session.
   */
  leaderId: string;
}

export interface QuestionRef {
  id: string;
  /**
   * Which session this question belongs to. Carried so the pinboard can check
   * that a proposal a client names actually sits on the board that client
   * joined — without that, knowing an id would be enough to reach across
   * sessions (F16).
   */
  sessionId: string;
  text: string;
  position: number;
  status: QuestionStatus;
}

const QUESTION_FIELDS = {
  id: true,
  sessionId: true,
  text: true,
  position: true,
  status: true,
} as const;

export async function getQuestion(questionId: string): Promise<QuestionRef | null> {
  return prisma.question.findUnique({
    where: { id: questionId },
    select: QUESTION_FIELDS,
  });
}

export async function getSession(sessionId: string): Promise<SessionRef | null> {
  const row = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, title: true, leaderId: true },
  });
  return row;
}

/**
 * The question the board is currently showing.
 *
 * STAND-IN BEHAVIOUR — "first question in `discussion`, else the first by
 * position". The real answer comes from the sessions phase machine (F25), which
 * tracks an explicit active question; this heuristic will be wrong for sessions
 * where no question is in discussion, or where more than one has been. It is
 * good enough to render a board against seeded data and must not outlive the
 * sessions module.
 */
export async function getActiveQuestion(sessionId: string): Promise<QuestionRef | null> {
  const questions = await prisma.question.findMany({
    where: { sessionId },
    orderBy: { position: 'asc' },
    select: QUESTION_FIELDS,
  });

  return questions.find((q) => q.status === 'discussion') ?? questions[0] ?? null;
}

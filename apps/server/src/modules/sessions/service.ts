// F04 — creating a session, and the read surface every other module goes
// through to reach `sessions`/`questions` (docs/02 §2: a module never queries
// another module's tables directly).
import type { Question, Session, SessionSummary } from '@roundtable/shared';
import type { CreateSessionInput } from '@roundtable/shared/schemas';

import { prisma } from '../../db.js';

export interface CreateSessionArgs {
  leaderId: string;
  /** Already validated by the caller against `createSessionSchema`. */
  input: CreateSessionInput;
}

/**
 * Create a draft session: the leader's title + ordered questions, with the
 * leader recorded as both `leaderId` and a `SessionMember` from the start.
 *
 * No join code is minted here — a `draft` is not joinable yet, so it has
 * nothing to claim. That happens on the draft -> lobby transition (F06 /
 * KAN-27), which is the only place a code is generated.
 *
 * One transaction: a session with zero questions, or questions with no
 * session, would both be half-finished states nothing else should ever see.
 */
export async function createSession({ leaderId, input }: CreateSessionArgs): Promise<Session> {
  const row = await prisma.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        title: input.title,
        leaderId,
        code: null,
        status: 'draft',
      },
    });

    // `position` is the array index: the order the leader arranged them in
    // is the order they play back in, with no separate reorder step for F04.
    await tx.question.createMany({
      data: input.questions.map((text, position) => ({
        sessionId: session.id,
        text,
        position,
      })),
    });

    await tx.sessionMember.create({
      data: { sessionId: session.id, userId: leaderId },
    });

    return session;
  });

  return row;
}

/**
 * Every session a user can see on their dashboard: the ones they lead, plus
 * the ones they've joined as a member. A leader is also a member (added in
 * `createSession`), so this is a single `OR`, not a union that could
 * duplicate a row.
 */
export async function listSessionsForUser(userId: string): Promise<SessionSummary[]> {
  const rows = await prisma.session.findMany({
    where: { OR: [{ leaderId: userId }, { members: { some: { userId } } }] },
    orderBy: { createdAt: 'desc' },
    select: { id: true, code: true, title: true, status: true, createdAt: true, leaderId: true },
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt,
    isLeader: row.leaderId === userId,
  }));
}

/** A session with its ordered questions — the detail view behind `GET /:id`. */
export async function getSessionWithQuestions(
  sessionId: string,
): Promise<(Session & { questions: Question[] }) | null> {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: { questions: { orderBy: { position: 'asc' } } },
  });
}

export interface SessionRef {
  id: string;
  title: string;
}

export interface QuestionRef {
  id: string;
  text: string;
  position: number;
  status: Question['status'];
}

/**
 * Minimal session lookup — the contract Pinboard's temporary adapter already
 * defined and depends on (docs/02 §2: a module reaches another only through
 * its public surface, never its tables).
 */
export async function getSession(sessionId: string): Promise<SessionRef | null> {
  return prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, title: true },
  });
}

export async function getQuestion(questionId: string): Promise<QuestionRef | null> {
  return prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, text: true, position: true, status: true },
  });
}

/**
 * The question the board is currently showing.
 *
 * STAND-IN BEHAVIOUR, carried over from Pinboard's adapter unchanged — "first
 * question in `discussion`, else the first by position". The real answer is
 * an explicit active-question pointer driven by the leader's phase controls
 * (F25); nothing sets `discussion` yet; so today this always falls back to
 * "first by position" in practice. Replacing the heuristic is F25's job, not
 * this ticket's — Pinboard (and anyone else calling this) does not need to
 * change when that happens.
 */
export async function getActiveQuestion(sessionId: string): Promise<QuestionRef | null> {
  const questions = await prisma.question.findMany({
    where: { sessionId },
    orderBy: { position: 'asc' },
    select: { id: true, text: true, position: true, status: true },
  });

  return questions.find((q) => q.status === 'discussion') ?? questions[0] ?? null;
}

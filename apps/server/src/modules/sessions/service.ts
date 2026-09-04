// F04 — creating a session, and the read surface every other module goes
// through to reach `sessions`/`questions` (docs/02 §2: a module never queries
// another module's tables directly).
import { randomInt } from 'node:crypto';

import { normalizeSessionCode, type Question, type Session, type SessionSummary } from '@roundtable/shared';
import { SESSION_CODE_ALPHABET, type CreateSessionInput } from '@roundtable/shared/schemas';

import { prisma } from '../../db.js';
import { ApiError } from '../../middleware/error.js';

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

/** Duck-typed rather than importing Prisma's error class: the `.code` is the
 * stable, documented contract across Prisma versions/generators. */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/** `XXXX-XXXX` from an alphabet with no `0/1/I/L/O` (packages/shared/src/schemas.ts). */
export function generateSessionCode(): string {
  const chars = Array.from({ length: 8 }, () =>
    SESSION_CODE_ALPHABET[randomInt(SESSION_CODE_ALPHABET.length)],
  ).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

const MAX_CODE_ATTEMPTS = 5;

export interface OpenSessionArgs {
  sessionId: string;
  leaderId: string;
}

/**
 * The `draft -> lobby` transition (F06): mints a code and makes the session
 * joinable. The insert-or-retry loop *is* the concurrency control — nothing
 * here ever checks whether a code is free before writing it, because that
 * check-then-write gap is exactly the race a unique index exists to close.
 * `code` is a normal column (not a separate claims table), so the write and
 * the claim are the same atomic operation; a collision surfaces as Prisma's
 * `P2002` on this call, not as a second, later failure.
 *
 * Already-`lobby` is treated as success, not a conflict: a double-click on
 * "Open for joining" should be a no-op, not an error toast.
 */
export async function openSessionForJoining({
  sessionId,
  leaderId,
}: OpenSessionArgs): Promise<Session> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
  }
  if (session.leaderId !== leaderId) {
    throw new ApiError(403, 'Only the session leader can open it for joining', 'NOT_SESSION_LEADER');
  }
  if (session.status === 'lobby') {
    return session;
  }
  if (session.status !== 'draft') {
    throw new ApiError(409, `Cannot open a session that is ${session.status}`, 'INVALID_TRANSITION');
  }

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      return await prisma.session.update({
        where: { id: sessionId },
        data: { code: generateSessionCode(), status: 'lobby' },
      });
    } catch (err) {
      if (!isUniqueConstraintViolation(err) || attempt === MAX_CODE_ATTEMPTS - 1) throw err;
      // Collision on the code itself — try again with a fresh one. At ~8.5e11
      // possible codes this is a correctness backstop, not a hot path.
    }
  }
  // Unreachable — the loop above always returns or throws — but keeps the
  // function's return type honest without a non-null assertion.
  throw new ApiError(500, 'Could not allocate a session code', 'CODE_ALLOCATION_FAILED');
}

export interface SessionPreview {
  id: string;
  title: string;
  status: Session['status'];
  leaderId: string;
  questionCount: number;
}

/** Resolves a user-typed or link-provided code to a joinable session preview. */
export async function resolveSessionByCode(rawCode: string): Promise<SessionPreview | null> {
  const code = normalizeSessionCode(rawCode);
  const session = await prisma.session.findUnique({
    where: { code },
    select: { id: true, title: true, status: true, leaderId: true, _count: { select: { questions: true } } },
  });
  if (!session) return null;

  return {
    id: session.id,
    title: session.title,
    status: session.status,
    leaderId: session.leaderId,
    questionCount: session._count.questions,
  };
}

export interface JoinSessionArgs {
  rawCode: string;
  userId: string;
}

/**
 * Resolve a code and add the user as a member. `sessionMember.upsert` on the
 * existing `@@unique([sessionId, userId])` (F04) is what makes joining twice
 * a no-op rather than a duplicate row or a thrown error — the ticket's "joining
 * twice doesn't create duplicate participant entries" is this upsert, not a
 * pre-check.
 *
 * Deliberately does not check `status`: a code stays valid through `active`
 * (it is only released on `ended` — see the `code` column comment on
 * `Session`), so this doubles as the late-join path. `SessionRouter` sends a
 * newly-joined member straight into `SessionPinboard` if the session already
 * started, and into `WaitingRoom` if it hasn't — the join itself doesn't need
 * to know which.
 */
export async function joinSessionByCode({ rawCode, userId }: JoinSessionArgs): Promise<{ sessionId: string }> {
  const session = await resolveSessionByCode(rawCode);
  if (!session) {
    throw new ApiError(404, 'Session not found — check the code', 'INVALID_CODE');
  }

  await prisma.sessionMember.upsert({
    where: { sessionId_userId: { sessionId: session.id, userId } },
    update: {},
    create: { sessionId: session.id, userId },
  });

  return { sessionId: session.id };
}

export interface SessionMemberRow {
  userId: string;
  displayName: string;
  joinedAt: Date;
}

/** Persisted membership history — the waiting room's initial render before live presence arrives. */
export async function listSessionMembers(sessionId: string): Promise<SessionMemberRow[]> {
  const rows = await prisma.sessionMember.findMany({
    where: { sessionId },
    orderBy: { joinedAt: 'asc' },
    select: { userId: true, joinedAt: true, user: { select: { displayName: true } } },
  });

  return rows.map((row) => ({
    userId: row.userId,
    displayName: row.user.displayName,
    joinedAt: row.joinedAt,
  }));
}

export interface SessionMemberIdentity {
  id: string;
  displayName: string;
}

/**
 * Confirms a user may be present in this session's room — leader or member
 * (F04 makes the leader a member from creation, so one check covers both) —
 * and returns the identity a socket needs to announce itself. The realtime
 * gateway is the caller: a socket must not join a room for a session it has
 * no relationship to (docs/02 §8.2), so membership and identity are fetched
 * together rather than as two round trips.
 */
export async function getSessionMemberIdentity(
  sessionId: string,
  userId: string,
): Promise<SessionMemberIdentity | null> {
  const membership = await prisma.sessionMember.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    select: { user: { select: { id: true, displayName: true } } },
  });
  return membership?.user ?? null;
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
  status: Session['status'];
  leaderId: string;
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
 * its public surface, never its tables). Widened for F08 to include `status`
 * and `leaderId`, which the realtime snapshot needs; existing callers that
 * only read `.title` are unaffected.
 */
export async function getSession(sessionId: string): Promise<SessionRef | null> {
  return prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, title: true, status: true, leaderId: true },
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

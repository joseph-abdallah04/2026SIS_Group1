// F04 — creating a session, and the read surface every other module goes
// through to reach `sessions`/`questions` (docs/02 §2: a module never queries
// another module's tables directly).
import { randomInt } from 'node:crypto';

import {
  normalizeSessionCode,
  type Question,
  type QuestionStatus,
  type Session,
  type SessionSummary,
} from '@roundtable/shared';
import {
  SESSION_CODE_ALPHABET,
  type CreateSessionInput,
  type UpdateSessionInput,
} from '@roundtable/shared/schemas';

import { prisma } from '../../db.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApiError } from '../../middleware/error.js';
import { sessionRoom, type RealtimeServer } from '../../realtime/types.js';

/**
 * `prisma` or a `$transaction` handle. Guards that decide whether a write is
 * allowed take one of these so they can run *inside* the transaction that
 * performs the write, closing the gap where the session changes state between
 * the check and the write.
 */
type PrismaLike = Prisma.TransactionClient | typeof prisma;

export interface CreateSessionArgs {
  leaderId: string;
  /** Already validated by the caller against `createSessionSchema`. */
  input: CreateSessionInput;
}

/**
 * One live session at a time (F07): a user who is a member of some
 * lobby/active session must leave it before joining another, opening one of
 * their drafts, or creating a new session. `draft` and `ended` memberships
 * don't count — unfinished setup and history are not *being in* a session.
 *
 * `exceptSessionId` is the session the caller is acting on, so re-joining or
 * re-opening the one they are already in stays idempotent.
 *
 * Enforced here rather than only in the UI's redirect: the dashboard's
 * redirect is a convenience, this is the rule. Two simultaneous joins could
 * still interleave past this check — the consequence is a second membership
 * row, not corrupt state, and the next page load resolves it by redirecting
 * into whichever session is found first.
 */
async function assertNotInAnotherLiveSession(
  userId: string,
  exceptSessionId?: string,
  client: PrismaLike = prisma,
): Promise<void> {
  const other = await client.session.findFirst({
    where: {
      status: { in: ['lobby', 'active'] },
      // `leftAt: null` is what makes leaving actually free you up — a past
      // membership is history (docs/02 §4), not a session you are still in.
      members: { some: { userId, leftAt: null } },
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    select: { title: true },
  });
  if (!other) return;

  throw new ApiError(
    409,
    `Leave "${other.title}" before joining or starting another session`,
    'ALREADY_IN_SESSION',
  );
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
    await assertNotInAnotherLiveSession(leaderId, undefined, tx);

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

export interface MutateDraftArgs {
  sessionId: string;
  leaderId: string;
}

/**
 * Shared guard for F05's two mutations: only the leader, only while `draft`.
 * Callers pass their transaction handle so the "is it still a draft?" answer
 * cannot go stale before the write — the leader could be opening the session
 * for joining in another tab.
 */
async function requireDraftOwnedBy(
  { sessionId, leaderId }: MutateDraftArgs,
  client: PrismaLike = prisma,
): Promise<Session> {
  const session = await client.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
  }
  if (session.leaderId !== leaderId) {
    throw new ApiError(403, 'Only the session leader can do that', 'NOT_SESSION_LEADER');
  }
  if (session.status !== 'draft') {
    throw new ApiError(
      409,
      `Cannot edit or delete a session that is ${session.status}`,
      'INVALID_TRANSITION',
    );
  }
  return session;
}

export interface UpdateSessionDraftArgs extends MutateDraftArgs {
  /** Already validated by the caller against `updateSessionSchema`. */
  input: UpdateSessionInput;
}

/**
 * F05: replace a draft's title and question list wholesale. There is no
 * per-question edit endpoint — the client always resubmits its full,
 * reordered list (mirrors `createSession`'s "array order is `position`"),
 * so this deletes and recreates the question rows rather than diffing them.
 * Safe to do: a draft has no proposals/votes pointing at its questions yet
 * (nothing is joinable before `lobby`), so there is nothing else to migrate.
 */
export async function updateSessionDraft({
  sessionId,
  leaderId,
  input,
}: UpdateSessionDraftArgs): Promise<Session & { questions: Question[] }> {
  return prisma.$transaction(async (tx) => {
    await requireDraftOwnedBy({ sessionId, leaderId }, tx);

    const session = await tx.session.update({
      where: { id: sessionId },
      data: { title: input.title },
    });

    await tx.question.deleteMany({ where: { sessionId } });
    await tx.question.createMany({
      data: input.questions.map((text, position) => ({ sessionId, text, position })),
    });

    const questions = await tx.question.findMany({
      where: { sessionId },
      orderBy: { position: 'asc' },
    });

    return { ...session, questions };
  });
}

/**
 * F05: delete a draft outright. Leader-only, draft-only — the same guard as
 * `updateSessionDraft`, because both ask "can this session still be
 * reshaped?" and the answer is identical. `Question`/`SessionMember` rows
 * cascade via the FK (`onDelete: Cascade` in schema.prisma); a draft's only
 * member is the leader, so nothing else loses data.
 */
export async function deleteSession({ sessionId, leaderId }: MutateDraftArgs): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await requireDraftOwnedBy({ sessionId, leaderId }, tx);
    await tx.session.delete({ where: { id: sessionId } });
  });
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
  const chars = Array.from(
    { length: 8 },
    () => SESSION_CODE_ALPHABET[randomInt(SESSION_CODE_ALPHABET.length)],
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
    throw new ApiError(
      403,
      'Only the session leader can open it for joining',
      'NOT_SESSION_LEADER',
    );
  }
  if (session.status === 'lobby') {
    return session;
  }
  if (session.status !== 'draft') {
    throw new ApiError(
      409,
      `Cannot open a session that is ${session.status}`,
      'INVALID_TRANSITION',
    );
  }

  await assertNotInAnotherLiveSession(leaderId, sessionId);

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      return await prisma.session.update({
        where: { id: sessionId },
        data: { code: generateSessionCode(), status: 'lobby' },
      });
    } catch (err) {
      if (!isUniqueConstraintViolation(err)) throw err;
      // Collision on the code itself — try again with a fresh one. At ~8.5e11
      // possible codes this is a correctness backstop, not a hot path.
    }
  }

  // Every attempt collided. Surfaced as our own error rather than the raw
  // `P2002`, which would reach the client as an unexplained 500: nothing the
  // caller did is wrong and retrying is the correct response.
  throw new ApiError(
    503,
    'Could not allocate a session code — try again',
    'CODE_ALLOCATION_FAILED',
  );
}

export interface StartSessionArgs {
  sessionId: string;
  leaderId: string;
}

/**
 * The `lobby -> active` transition (F09): leader-only, records `startedAt`,
 * and — unlike `openSessionForJoining` — has no retry loop, because nothing
 * here is contested. The realtime fan-out that moves every waiting client
 * into the session view at once is the caller's job (`emitSessionStarted`,
 * below): this function only performs and returns the state change so
 * routes.ts can broadcast it with the `io` instance routes have and this
 * module's pure service functions deliberately don't.
 *
 * Already-`active` is a no-op, same reasoning as `openSessionForJoining`'s
 * already-`lobby` case: a double-click on "Start session" should not error.
 */
export async function startSession({ sessionId, leaderId }: StartSessionArgs): Promise<Session> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
  }
  if (session.leaderId !== leaderId) {
    throw new ApiError(403, 'Only the session leader can start it', 'NOT_SESSION_LEADER');
  }
  if (session.status === 'active') {
    return session;
  }
  if (session.status !== 'lobby') {
    throw new ApiError(
      409,
      `Cannot start a session that is ${session.status}`,
      'INVALID_TRANSITION',
    );
  }

  return prisma.$transaction(async (tx) => {
    const started = await tx.session.update({
      where: { id: sessionId },
      data: { status: 'active', startedAt: new Date() },
    });

    // Starting the session opens the first question, in the same transaction:
    // a session that is `active` but whose every question is still `pending`
    // is a live board that refuses proposals (see pinboard's
    // `createProposal`), which reads as broken rather than as "waiting for the
    // leader". F25 owns every transition after this one; this is only the
    // first, and it is implied by the leader pressing Start.
    const first = await tx.question.findFirst({
      where: { sessionId, status: 'pending' },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    if (first) {
      await tx.question.update({ where: { id: first.id }, data: { status: 'discussion' } });
    }

    return started;
  });
}

/**
 * Which statuses may follow which (F25). Leaving a state out of a list is the
 * rule, not an omission:
 *
 * - nothing returns to `pending`, so "un-start" a question is not expressible;
 * - `discussion -> answered` is absent because answering is what closes a
 *   vote (F30) — a leader who wants to move on without voting skips instead,
 *   which records *that* rather than inventing an answer nobody chose;
 * - `answered` and `skipped` are terminal, so the agenda only moves forward
 *   and a question cannot be reopened after the board has moved past it.
 */
const PHASE_TRANSITIONS: Record<QuestionStatus, readonly QuestionStatus[]> = {
  pending: ['discussion', 'skipped'],
  discussion: ['voting', 'skipped'],
  voting: ['answered', 'skipped'],
  answered: [],
  skipped: [],
};

export interface SetQuestionPhaseArgs {
  sessionId: string;
  questionId: string;
  leaderId: string;
  status: QuestionStatus;
}

/**
 * F25 (and F26, which is the `skipped` target): the leader moves one question
 * through the agenda.
 *
 * Runs in a transaction because the "only one question is open at a time"
 * invariant is read-then-write: two rapid clicks could otherwise each see no
 * open question and both open one, leaving the board with two live questions
 * and no way to say which is current.
 *
 * Only while the session is `active`. Phases in a lobby would mean discussion
 * before anyone has arrived, and in an ended session they would edit a
 * finished record.
 */
export async function setQuestionPhase({
  sessionId,
  questionId,
  leaderId,
  status,
}: SetQuestionPhaseArgs): Promise<QuestionRef> {
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: { leaderId: true, status: true },
    });
    if (!session) {
      throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
    }
    if (session.leaderId !== leaderId) {
      throw new ApiError(403, 'Only the session leader controls the agenda', 'NOT_SESSION_LEADER');
    }
    if (session.status !== 'active') {
      throw new ApiError(
        409,
        `Cannot change the agenda of a session that is ${session.status}`,
        'INVALID_TRANSITION',
      );
    }

    const question = await tx.question.findUnique({
      where: { id: questionId },
      select: QUESTION_REF_SELECT,
    });
    // The `sessionId` check is what stops a leader from driving another
    // session's agenda through their own session's endpoint.
    if (!question || question.sessionId !== sessionId) {
      throw new ApiError(404, 'Question not found in this session', 'QUESTION_NOT_FOUND');
    }

    // Before the transition table, so a double-clicked button is a no-op
    // rather than an INVALID_PHASE_TRANSITION the leader has to make sense of.
    if (question.status === status) {
      return question;
    }

    if (!PHASE_TRANSITIONS[question.status].includes(status)) {
      throw new ApiError(
        409,
        `A question that is ${question.status} cannot become ${status}`,
        'INVALID_PHASE_TRANSITION',
      );
    }

    if (status === 'discussion' || status === 'voting') {
      const open = await tx.question.findFirst({
        where: {
          sessionId,
          id: { not: questionId },
          status: { in: ['discussion', 'voting'] },
        },
        select: { position: true },
      });
      if (open) {
        throw new ApiError(
          409,
          `Question ${open.position + 1} is still open — answer or skip it first`,
          'QUESTION_ALREADY_OPEN',
        );
      }
    }

    return tx.question.update({
      where: { id: questionId },
      data: { status },
      select: QUESTION_REF_SELECT,
    });
  });
}

/**
 * Broadcasts F25's `sessionPhase`. Same shape and reasoning as
 * `emitSessionStarted`: `io` is a parameter and `routes.ts` is the caller.
 */
export function emitQuestionPhase(
  io: RealtimeServer,
  sessionId: string,
  question: QuestionRef,
): void {
  io.to(sessionRoom(sessionId)).emit('sessionPhase', {
    sessionId,
    questionId: question.id,
    status: question.status,
  });
}

/**
 * Broadcasts F09's `sessionStarted` to everyone in the room, leader's own
 * socket included (same "author sees the broadcast too" rule as
 * `emitProposalCreated` in the pinboard module). Takes `io` as a parameter
 * rather than importing a shared singleton — the same pattern pinboard's
 * socket.ts uses — so this module stays testable without a real Socket.IO
 * server, and REST (`routes.ts`, which owns `io`) is the only caller.
 */
export function emitSessionStarted(io: RealtimeServer, session: Session): void {
  if (!session.startedAt) {
    // `startSession` always sets this, so reaching here means a caller
    // broadcast a session it didn't start. Throwing beats returning: a silent
    // no-op shows up as "nobody left the waiting room", with nothing to trace.
    throw new ApiError(500, 'Cannot announce a session that has no startedAt', 'NOT_STARTED');
  }
  io.to(sessionRoom(session.id)).emit('sessionStarted', {
    sessionId: session.id,
    startedAt: session.startedAt.toISOString(),
  });
}

export interface EndSessionArgs {
  sessionId: string;
  leaderId: string;
}

/**
 * F32: the leader ends the session. Leader-only, records `endedAt`, and
 * releases the join code back to NULL — an ended session is not joinable, and
 * the unique index is only free to hand that code out again once it's gone
 * (see the `code` column comment in schema.prisma).
 *
 * Allowed from `lobby` as well as `active`, though the ticket names only
 * `active`: the leader is locked into a lobby exactly as much as a live
 * session (the dashboard routes them back into it and `leaveSession` refuses
 * them), so refusing here would strand whoever opens a session and then
 * changes their mind — which is the dead end this ticket exists to remove.
 *
 * Already-`ended` is a no-op, same reasoning as `startSession`'s
 * already-`active`: a double-click on a confirmed, irreversible action should
 * not produce an error on the second click.
 *
 * Member rows are deliberately left as they are — `leftAt` stays NULL for
 * whoever was still present, which is the truthful record of who was in the
 * session when it ended (docs/02 §4), and what F31's summary will read.
 */
export async function endSession({ sessionId, leaderId }: EndSessionArgs): Promise<Session> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
  }
  if (session.leaderId !== leaderId) {
    throw new ApiError(403, 'Only the session leader can end it', 'NOT_SESSION_LEADER');
  }
  if (session.status === 'ended') {
    return session;
  }
  if (session.status !== 'lobby' && session.status !== 'active') {
    throw new ApiError(409, `Cannot end a session that is ${session.status}`, 'INVALID_TRANSITION');
  }

  return prisma.session.update({
    where: { id: sessionId },
    data: { status: 'ended', endedAt: new Date(), code: null },
  });
}

/**
 * Broadcasts F32's `sessionEnded` to the room, so nobody is left sitting on a
 * live board that no longer exists. Same shape and reasoning as
 * `emitSessionStarted` — `io` is a parameter, and `routes.ts` is the caller.
 */
export function emitSessionEnded(io: RealtimeServer, session: Session): void {
  if (!session.endedAt) {
    throw new ApiError(500, 'Cannot announce a session that has no endedAt', 'NOT_ENDED');
  }
  io.to(sessionRoom(session.id)).emit('sessionEnded', {
    sessionId: session.id,
    endedAt: session.endedAt.toISOString(),
  });
}

export interface LeaveSessionArgs {
  sessionId: string;
  userId: string;
}

/**
 * F07's explicit "Leave session" action — distinct from a socket disconnect
 * (docs/02 §4: presence is in-memory and does not touch `SessionMember`).
 * Stamps `leftAt` rather than deleting the row: this table is history, and
 * the summary and the vote denominator both count everyone who took part, so
 * a delete would rewrite the past and orphan any votes they cast. Everything
 * that means "who is in this session" filters on `leftAt: null` instead.
 *
 * Only a live session can be left — leaving an `ended` one would edit history
 * for no benefit, and a `draft` has no members but its leader.
 *
 * The leader cannot leave: with no F32 (End session) yet, leaving would
 * strand the session with a leader-shaped hole nothing else accounts for, so
 * it is refused rather than allowed to corrupt state silently.
 *
 * `updateMany` filtered on `leftAt: null` (not `update`) makes a repeat call —
 * or a call from someone who was never a member — a no-op affecting zero rows,
 * instead of a thrown "not found" or a second `leftAt` overwriting the first.
 */
export async function leaveSession({ sessionId, userId }: LeaveSessionArgs): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { leaderId: true, status: true },
  });
  if (!session) {
    throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
  }
  if (session.leaderId === userId) {
    throw new ApiError(
      409,
      'The leader cannot leave — end the session instead',
      'LEADER_CANNOT_LEAVE',
    );
  }
  if (session.status !== 'lobby' && session.status !== 'active') {
    throw new ApiError(
      409,
      `Cannot leave a session that is ${session.status}`,
      'INVALID_TRANSITION',
    );
  }

  await prisma.sessionMember.updateMany({
    where: { sessionId, userId, leftAt: null },
    data: { leftAt: new Date() },
  });
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
    select: {
      id: true,
      title: true,
      status: true,
      leaderId: true,
      _count: { select: { questions: true } },
    },
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
 *
 * Rejoining *this* session is a no-op (the upsert below). Joining a *different*
 * lobby/active session while still a member of another is refused — one live
 * session at a time; leave first (F07).
 */
export async function joinSessionByCode({
  rawCode,
  userId,
}: JoinSessionArgs): Promise<{ sessionId: string }> {
  const session = await resolveSessionByCode(rawCode);
  if (!session) {
    throw new ApiError(404, 'Session not found — check the code', 'INVALID_CODE');
  }

  await assertNotInAnotherLiveSession(userId, session.id);

  await prisma.sessionMember.upsert({
    where: { sessionId_userId: { sessionId: session.id, userId } },
    // Clearing `leftAt` is the rejoin: someone who left and came back is in
    // the session again, but keeps their original `joinedAt` — the history
    // this table exists for is "took part from when", not "last arrived".
    update: { leftAt: null },
    create: { sessionId: session.id, userId },
  });

  return { sessionId: session.id };
}

export interface SessionMemberRow {
  userId: string;
  displayName: string;
  joinedAt: Date;
}

/**
 * The waiting room's initial render, before live presence arrives. Only
 * current members (`leftAt: null`) — someone who left should not show up as
 * waiting, even though their row survives as history.
 */
export async function listSessionMembers(sessionId: string): Promise<SessionMemberRow[]> {
  const rows = await prisma.sessionMember.findMany({
    where: { sessionId, leftAt: null },
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
 *
 * Requires `leftAt: null`: having once been in a session is not permission to
 * sit in its room. Someone who left rejoins by code (F06), which clears it.
 */
export async function getSessionMemberIdentity(
  sessionId: string,
  userId: string,
): Promise<SessionMemberIdentity | null> {
  const membership = await prisma.sessionMember.findFirst({
    where: { sessionId, userId, leftAt: null },
    select: { user: { select: { id: true, displayName: true } } },
  });
  return membership?.user ?? null;
}

/**
 * REST counterpart to the socket room check above: a session's title,
 * questions, and member names are only for people in it. Session ids are not
 * secrets — they sit in shareable URLs — so "knows the id" cannot be the
 * authorisation for reading a session; the invite code is (F06), and using it
 * produces the membership this asserts.
 *
 * Every legitimate caller already passes: the join flow is code -> `POST
 * /join` -> membership -> `GET /:id`, and F04 makes the leader a member at
 * creation. A user who has *left* still passes, deliberately, so an ended
 * session they attended stays readable from their dashboard.
 */
export async function assertSessionMember(sessionId: string, userId: string): Promise<void> {
  const membership = await prisma.sessionMember.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    select: { id: true },
  });
  if (!membership) {
    throw new ApiError(403, 'You are not a member of this session', 'NOT_SESSION_MEMBER');
  }
}

/**
 * Every session a user can see on their dashboard: the ones they lead, plus
 * the ones they've joined as a member. A leader is also a member (added in
 * `createSession`), so this is a single `OR`, not a union that could
 * duplicate a row.
 *
 * Sessions they *left* are included — that's the history half of F07's
 * "hosted & invited" list. `isCurrentMember` is what separates the two, and
 * the dashboard needs it: without it, a session someone walked out of still
 * looks live to them and the one-live-session redirect would drag them back
 * in on every page load.
 */
export async function listSessionsForUser(userId: string): Promise<SessionSummary[]> {
  const rows = await prisma.session.findMany({
    where: { OR: [{ leaderId: userId }, { members: { some: { userId } } }] },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      createdAt: true,
      leaderId: true,
      members: { where: { userId }, select: { leftAt: true } },
    },
  });

  return rows.map((row) => {
    const membership = row.members[0];
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      status: row.status,
      createdAt: row.createdAt,
      isLeader: row.leaderId === userId,
      // No row at all should be impossible (F04 adds the leader), but a
      // leader is in their own session either way — don't let a stray
      // pre-F04 row lock someone out of their session.
      isCurrentMember: membership ? membership.leftAt === null : row.leaderId === userId,
    };
  });
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
  /**
   * Which session this question belongs to. Two callers need it, both in
   * Pinboard: F16's permission rules check that a proposal a client names sits
   * on the board that client actually joined (without this, knowing an id would
   * be enough to reach across sessions), and F32's write gate reaches the
   * session to ask whether it still accepts writes at all — which the
   * question's own status cannot answer, since ending a session leaves it
   * untouched.
   */
  sessionId: string;
  text: string;
  position: number;
  status: Question['status'];
}

/** Every read that returns a `QuestionRef` selects exactly these columns. */
const QUESTION_REF_SELECT = {
  id: true,
  sessionId: true,
  text: true,
  position: true,
  status: true,
} as const;

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
    select: QUESTION_REF_SELECT,
  });
}

/**
 * The question the board is currently showing.
 *
 * Derived from the phases F25 writes rather than stored as a pointer, so
 * "which question is current" has exactly one source of truth and cannot
 * disagree with the statuses the agenda panel renders:
 *
 * 1. the open question — `discussion` or `voting`, and `setQuestionPhase`
 *    guarantees there is at most one;
 * 2. failing that, the next `pending` one, so the board shows what is coming
 *    up between the leader answering one question and opening the next
 *    (proposals stay closed until it is actually in `discussion`);
 * 3. `null` once every question is answered or skipped — the agenda is done
 *    and the leader's remaining move is to end the session (F32).
 *
 * This replaces the heuristic Pinboard's adapter carried while F25 did not
 * exist ("first in discussion, else first by position"), which could not tell
 * a finished agenda from one that had not started.
 */
export async function getActiveQuestion(sessionId: string): Promise<QuestionRef | null> {
  const questions = await prisma.question.findMany({
    where: { sessionId },
    orderBy: { position: 'asc' },
    select: QUESTION_REF_SELECT,
  });

  return (
    questions.find((q) => q.status === 'discussion' || q.status === 'voting') ??
    questions.find((q) => q.status === 'pending') ??
    null
  );
}

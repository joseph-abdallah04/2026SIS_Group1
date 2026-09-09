import {
  isEmoji,
  type AuthoredProposalGroup,
  type AuthoredProposalsResponse,
  type BoardItem,
  type BoardResponse,
  type ReactionGroup,
} from '@roundtable/shared';
import {
  artifactJsonSchema,
  type ProposalCreateInput,
  type ProposalUpdateInput,
} from '@roundtable/shared/schemas';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../db.js';
import { ApiError } from '../../middleware/error.js';
import { requireMutableProposal, type Actor, type ProposalMutation } from './permissions.js';
import {
  getActiveQuestion,
  getQuestion,
  getSession,
  getSessionWithQuestions,
} from './sessionsAdapter.js';

// The pinboard's read side (F14: the board every participant loads, in one
// agreed order), its create side (F15: proposals land for everyone at once),
// its author-edit side (F16: edit, move, delete your own) and its reactions
// (F18).
//
// Every mutation here is deliberately socket-agnostic: the caller broadcasts.
// That keeps one write path per operation no matter who is calling — a tool
// editor over a socket, the assistant proposing server-side (F37), or the
// leader moderating (F17) — so the rules cannot be bypassed by arriving from a
// different direction.

/**
 * Everything a `BoardItem` is built from, in one place.
 *
 * Every query that produces a card uses this, so a path cannot quietly return
 * a row missing a field the board needs. That matters most for reactions: a
 * move broadcasts the whole row, so an include that forgot them would clear
 * every count on the card the moment somebody nudged it.
 */
const BOARD_ITEM_INCLUDE = {
  author: { select: { displayName: true } },
  // Oldest first, so the order people reacted in is the order they are listed.
  reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ProposalInclude;

type ProposalRow = Prisma.ProposalGetPayload<{ include: typeof BOARD_ITEM_INCLUDE }>;

/**
 * Reaction rows folded into the per-emoji groups a card renders (F18).
 *
 * Every emoji anyone used is kept, not just the three a card offers as chips:
 * the quick set decides what is one press away, never what may exist.
 *
 * Order is first-reaction order, which falls out of reading the rows oldest
 * first — the emoji somebody reached for first sits leftmost. It comes from
 * the server so that every client arranges an unfamiliar reaction the same
 * way rather than each inventing an order of its own.
 */
function toReactionGroups(rows: readonly { emoji: string; userId: string }[]): ReactionGroup[] {
  const byEmoji = new Map<string, string[]>();

  for (const row of rows) {
    // Defensive: the write path admits nothing but a single emoji. A row that
    // slipped past it would render as loose text among the chips, which is
    // somewhere nobody agreed could be written to.
    if (!isEmoji(row.emoji)) continue;
    const users = byEmoji.get(row.emoji);
    if (users) users.push(row.userId);
    else byEmoji.set(row.emoji, [row.userId]);
  }

  return [...byEmoji].map(([emoji, userIds]) => ({ emoji, userIds }));
}

export function toBoardItem(row: ProposalRow): BoardItem {
  const parsed = artifactJsonSchema.safeParse(row.artifactJson);
  if (!parsed.success || parsed.data.type !== row.type) {
    throw new ApiError(500, 'Invalid artifact data stored for proposal', 'INVALID_ARTIFACT');
  }

  return {
    id: row.id,
    questionId: row.questionId,
    authorId: row.authorId,
    authorName: row.author.displayName,
    type: row.type,
    artifactJson: parsed.data,
    x: row.x,
    y: row.y,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    extendsProposalId: row.extendsProposalId,
    reactions: toReactionGroups(row.reactions),
  };
}

export async function listProposals(questionId: string): Promise<BoardItem[]> {
  const rows = await prisma.proposal.findMany({
    where: { questionId, deletedAt: null },
    include: BOARD_ITEM_INCLUDE,
    // The total order every client agrees on: creation time, then id to break
    // same-millisecond ties (F14 — "identical boards in identical order").
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  return rows.map(toBoardItem);
}

export interface CreateProposalArgs {
  questionId: string;
  /** Resolved from the authenticated socket by the caller — never client-supplied. */
  authorId: string;
  input: ProposalCreateInput;
}

/**
 * Persist a proposal and return it in board shape.
 *
 * Deliberately knows nothing about sockets: the caller broadcasts. That keeps
 * this the single write path for every producer — the tool editors (F19–F21)
 * and propose-from-chat (F37) all land here, so validation and ownership work
 * the same way regardless of who proposed (docs/02 §8.8).
 *
 * Every rule that decides whether a write is *allowed* lives here rather than
 * in the socket handler, so a server-side caller (the assistant proposing on a
 * user's behalf) cannot bypass them by not going through a socket.
 */
export async function createProposal({
  questionId,
  authorId,
  input,
}: CreateProposalArgs): Promise<BoardItem> {
  const question = await getQuestion(questionId);
  if (!question) {
    throw new ApiError(404, 'Question not found', 'QUESTION_NOT_FOUND');
  }
  // The session gate, checked before the question's own: an ended session
  // (F32) leaves its questions' statuses untouched, so a question left in
  // `discussion` would otherwise keep accepting proposals after the leader
  // wrapped up. `active` is also the only status where a board is on screen —
  // a `lobby` session is still in the waiting room.
  const session = await getSession(question.sessionId);
  if (!session || session.status !== 'active') {
    throw new ApiError(
      409,
      session?.status === 'ended'
        ? 'This session has ended — the board is read-only'
        : 'This session is not live',
      'SESSION_NOT_ACTIVE',
    );
  }
  // Proposals belong to the ideation phase. Once a question moves to voting or
  // is answered the board is the thing being voted on, so it must stop moving.
  if (question.status !== 'discussion') {
    throw new ApiError(
      409,
      `This question is ${question.status} — proposals are closed`,
      'QUESTION_CLOSED',
    );
  }

  if (input.extendsProposalId) {
    // Scoped to the session rather than to this question. Extending (F23)
    // always names something on the board in front of you, but reusing your
    // own earlier work (F38) names something from a question that has since
    // closed, and both arrive here as the same write. The session is still the
    // boundary: a proposal from somebody else's session stays unreachable, and
    // reporting it the same way as a deleted one keeps that from being a way
    // to test whether an id exists.
    const parent = await prisma.proposal.findFirst({
      where: {
        id: input.extendsProposalId,
        deletedAt: null,
        question: { sessionId: question.sessionId },
      },
      select: { id: true },
    });
    if (!parent) {
      throw new ApiError(
        400,
        'Cannot build on a proposal that is not in this session',
        'INVALID_EXTENDS',
      );
    }
  }

  const row = await prisma.proposal.create({
    data: {
      questionId,
      authorId,
      type: input.type,
      artifactJson: input.artifactJson as unknown as Prisma.InputJsonValue,
      x: input.x,
      y: input.y,
      extendsProposalId: input.extendsProposalId ?? null,
    },
    include: BOARD_ITEM_INCLUDE,
  });

  return toBoardItem(row);
}

/**
 * Load a proposal together with the board it sits on, and confirm this actor
 * may change it. Shared by edit and delete so the two can never drift apart on
 * who is allowed to do what.
 */
async function loadForMutation(proposalId: string, actor: Actor, mutation: ProposalMutation) {
  const row = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: BOARD_ITEM_INCLUDE,
  });

  // The question and the session both come from the sessions adapter, not a
  // Prisma `include`: the pinboard owns proposals, not questions or sessions,
  // and reading one through a relation is still reaching into another module's
  // table (docs/02 §2).
  const question = row ? await getQuestion(row.questionId) : null;
  const session = question ? await getSession(question.sessionId) : null;
  const isLeader = session?.leaderId === actor.id;

  return { row: requireMutableProposal(row, question, actor, { mutation, isLeader }), question };
}

/**
 * Edit a proposal's content, its position, or both (F16).
 *
 * A drag sends coordinates only and a text edit sends the artifact only, so
 * anything absent from the input is left exactly as it was rather than being
 * overwritten with a default.
 */
export async function updateProposal({
  proposalId,
  actor,
  input,
}: {
  proposalId: string;
  actor: Actor;
  input: ProposalUpdateInput;
}): Promise<BoardItem> {
  // Content and position carry different permissions — the leader may arrange
  // the shared board without being able to rewrite what anyone said — so which
  // one this is has to be decided before the check, not after. A payload
  // carrying both counts as an edit: the stricter rule wins, or a leader could
  // rewrite anything by attaching coordinates to it.
  const { row } = await loadForMutation(
    proposalId,
    actor,
    input.artifactJson === undefined ? 'move' : 'edit',
  );

  // An edit changes what a proposal says, never what kind of thing it is: the
  // `type` column and the artifact must keep agreeing, and turning a sticky
  // into a diagram is a new idea rather than an edit of this one.
  if (input.artifactJson && input.artifactJson.type !== row.type) {
    throw new ApiError(
      400,
      `A ${row.type} proposal cannot become a ${input.artifactJson.type}`,
      'ARTIFACT_TYPE_MISMATCH',
    );
  }

  const updated = await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      // `editedAt` moves with the artifact and only with it. A payload that
      // carries coordinates alone is a move, and a move leaves no trace on the
      // card beyond its new position.
      ...(input.artifactJson
        ? {
            artifactJson: input.artifactJson as unknown as Prisma.InputJsonValue,
            editedAt: new Date(),
          }
        : {}),
      ...(input.x === undefined ? {} : { x: input.x }),
      ...(input.y === undefined ? {} : { y: input.y }),
    },
    include: BOARD_ITEM_INCLUDE,
  });

  return toBoardItem(updated);
}

/**
 * Remove a proposal from the board (F16).
 *
 * Soft delete, per docs/02 §3: reactions, votes and extend-children all point
 * at this row, so the record stays and only its place on the board goes. The
 * returned questionId lets the caller address the broadcast at the right board.
 */
export async function deleteProposal({
  proposalId,
  actor,
}: {
  proposalId: string;
  actor: Actor;
}): Promise<{ proposalId: string; questionId: string }> {
  const { row } = await loadForMutation(proposalId, actor, 'delete');

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { deletedAt: new Date() },
  });

  return { proposalId: row.id, questionId: row.questionId };
}

/** Every reaction on one proposal, already grouped for the wire. */
async function listReactions(proposalId: string): Promise<ReactionGroup[]> {
  const rows = await prisma.proposalReaction.findMany({
    where: { proposalId },
    select: { emoji: true, userId: true },
    orderBy: { createdAt: 'asc' },
  });

  return toReactionGroups(rows);
}

/**
 * A write refused because the row is already there.
 *
 * Read off the error shape rather than through `instanceof`: this module keeps
 * its Prisma import type-only, and importing the client namespace as a value
 * just to name an error class would pull the generated runtime into a file
 * whose job is rules.
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Set, change or take back one person's reaction (F18).
 *
 * A person has one reaction per proposal, so this has three outcomes rather
 * than two. Pressing the chip you already left takes it back. Pressing a
 * different one moves your reaction to it, because a reaction says how you
 * feel about an idea and you do not feel two ways at once. Pressing when you
 * have none leaves one.
 *
 * Which of the three happens is decided here, from what is stored, rather than
 * by the client saying "add" or "remove". A client that has fallen behind would
 * otherwise ask to remove a reaction it no longer has, or add one it already
 * left, and the board would end up reflecting the order intents happened to
 * arrive in instead of what was actually pressed.
 *
 * Double-counting is impossible by construction: one row per person per
 * proposal is a unique index, so the tenth press of a chip can neither insert a
 * second row nor remove one that was never there.
 *
 * Returns the proposal's whole reaction state, not a delta, so the broadcast
 * corrects any client that missed an earlier one.
 */
export async function toggleReaction({
  proposalId,
  actor,
  emoji,
}: {
  proposalId: string;
  actor: Actor;
  /** Confirmed to be a single emoji by the caller's schema. */
  emoji: string;
}): Promise<{ proposalId: string; questionId: string; reactions: ReactionGroup[] }> {
  const { row } = await loadForMutation(proposalId, actor, 'react');

  const mine = await prisma.proposalReaction.findUnique({
    where: { proposalId_userId: { proposalId, userId: actor.id } },
    select: { emoji: true },
  });

  if (mine?.emoji === emoji) {
    // Pressing what you already left takes it back.
    await prisma.proposalReaction.deleteMany({ where: { proposalId, userId: actor.id } });
  } else {
    try {
      // Whether this is your first reaction or a change of mind, the row that
      // has to exist afterwards is the same one, so one write covers both.
      await prisma.proposalReaction.upsert({
        where: { proposalId_userId: { proposalId, userId: actor.id } },
        create: { proposalId, userId: actor.id, emoji },
        update: { emoji },
      });
    } catch (err) {
      // Two of this person's own clients pressed at once and the index refused
      // the second insert. They have a reaction, which is what both presses
      // asked for. Anything else is a real failure.
      if (!isUniqueViolation(err)) throw err;
    }
  }

  return {
    proposalId: row.id,
    questionId: row.questionId,
    reactions: await listReactions(proposalId),
  };
}

/**
 * Everything one member has proposed across a whole session (F38).
 *
 * The board read returns one question at a time, because that is what a board
 * is. This crosses that boundary on purpose: the point is to find something
 * you proposed while a different question was up, so it has to see the
 * questions the board has moved past.
 *
 * Scoped to a single author by the caller, never by a filter the client sends.
 * A member may see their own history; whether anyone may see somebody else's
 * is a different question, and this is not the endpoint that answers it.
 *
 * Questions come back newest first, which is the order they are useful in: the
 * thing you proposed a minute ago is far likelier to be worth reusing than the
 * one from the top of the agenda. Empty questions are dropped rather than
 * listed as headings with nothing under them.
 */
export async function listAuthoredProposals({
  sessionId,
  authorId,
}: {
  sessionId: string;
  authorId: string;
}): Promise<AuthoredProposalsResponse> {
  const session = await getSessionWithQuestions(sessionId);
  if (!session) {
    throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
  }

  const active = await getActiveQuestion(sessionId);
  const questionIds = session.questions.map((question) => question.id);

  const rows = questionIds.length
    ? await prisma.proposal.findMany({
        where: { questionId: { in: questionIds }, authorId, deletedAt: null },
        include: BOARD_ITEM_INCLUDE,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
    : [];

  const byQuestion = new Map<string, BoardItem[]>();
  for (const row of rows) {
    const item = toBoardItem(row);
    const bucket = byQuestion.get(item.questionId);
    if (bucket) bucket.push(item);
    else byQuestion.set(item.questionId, [item]);
  }

  const groups: AuthoredProposalGroup[] = [...session.questions]
    .sort((a, b) => b.position - a.position)
    .flatMap((question) => {
      const items = byQuestion.get(question.id);
      if (!items) return [];
      return [
        {
          questionId: question.id,
          questionText: question.text,
          questionPosition: question.position,
          questionStatus: question.status,
          isCurrent: question.id === active?.id,
          items,
        },
      ];
    });

  return { sessionId, currentQuestionId: active?.id ?? null, groups };
}

export async function getBoardForSession(sessionId: string): Promise<BoardResponse> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
  }

  const question = await getActiveQuestion(sessionId);
  if (!question) {
    return {
      sessionId,
      sessionTitle: session.title,
      leaderId: session.leaderId,
      questionId: null,
      questionText: null,
      questionPosition: null,
      questionStatus: null,
      items: [],
    };
  }

  return {
    sessionId,
    sessionTitle: session.title,
    leaderId: session.leaderId,
    questionId: question.id,
    questionText: question.text,
    questionPosition: question.position,
    questionStatus: question.status,
    items: await listProposals(question.id),
  };
}

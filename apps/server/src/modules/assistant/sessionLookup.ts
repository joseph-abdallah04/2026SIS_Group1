// What the assistant can find out about the session it is sitting in, beyond the agenda it
// is handed in every prompt.
//
// This is the read side of `look_up_session` (F36). It exists as its own file because the
// tool must not reach into other modules itself: everything here comes through the
// Sessions, Pinboard and Voting modules' public surfaces (docs/02 §2), exactly as
// `context.ts` already reads the board.
//
// Read-only, always. The assistant's view of a session never mutates it (docs/06), so
// nothing in this file writes, and the tool it serves cannot be made to.
import { summarizeArtifact } from '@roundtable/shared';

import { listProposals } from '../pinboard/index.js';
import { getActiveQuestion, getSessionWithQuestions } from '../sessions/index.js';
import { getSessionVoteOutcomes } from '../voting/index.js';

/** A question as the agenda shows it: numbered from 1, the way the user sees it. */
export interface QuestionFacts {
  number: number;
  id: string;
  text: string;
  status: 'pending' | 'discussion' | 'voting' | 'answered' | 'skipped';
  isCurrent: boolean;
}

export interface Agenda {
  sessionId: string;
  title: string;
  questions: QuestionFacts[];
  current: QuestionFacts | null;
}

/**
 * The agenda and where the session has got to in it.
 *
 * Read on every turn, so it carries no proposal text: what the prompt needs is the shape
 * of the session and which question is live. Everything else the assistant can ask for.
 */
export async function readAgenda(sessionId: string): Promise<Agenda | null> {
  const session = await getSessionWithQuestions(sessionId);
  if (!session) return null;

  const active = await getActiveQuestion(sessionId);

  const questions: QuestionFacts[] = [...session.questions]
    .sort((a, b) => a.position - b.position)
    .map((question, index) => ({
      number: index + 1,
      id: question.id,
      text: question.text,
      status: question.status,
      isCurrent: question.id === active?.id,
    }));

  return {
    sessionId,
    title: session.title,
    questions,
    current: questions.find((question) => question.isCurrent) ?? null,
  };
}

/** One proposal, described the way the board describes it. */
export interface ProposalFacts {
  type: string;
  summary: string;
  author: string;
}

export async function readProposalsFor(question: QuestionFacts): Promise<ProposalFacts[]> {
  const items = await listProposals(question.id);
  return items.map((item) => ({
    type: item.artifactJson.type,
    summary: summarizeArtifact(item.artifactJson),
    author: item.authorName,
  }));
}

/**
 * What a settled question was settled on.
 *
 * The winner only — not the tallies, and not who voted for what. The assistant is a
 * private aide to one participant; how the room voted is the room's business, while what
 * the team decided is what it needs in order not to re-tread ground.
 */
export interface QuestionAnswer {
  question: QuestionFacts;
  /** The winning proposal, or null for a question that was skipped or ended in a tie. */
  winner: ProposalFacts | null;
}

export async function readAnswers(agenda: Agenda): Promise<QuestionAnswer[]> {
  const settled = agenda.questions.filter(
    (question) => question.status === 'answered' || question.status === 'skipped',
  );
  if (settled.length === 0) return [];

  const outcomes = await getSessionVoteOutcomes(agenda.sessionId);
  const winnerByQuestion = new Map(
    outcomes.map((outcome) => [outcome.questionId, outcome.winnerProposalId]),
  );

  return Promise.all(
    settled.map(async (question) => {
      const winnerId = winnerByQuestion.get(question.id) ?? null;
      if (!winnerId) return { question, winner: null };

      // Resolved against the question's own board rather than fetched by id: the pinboard
      // exposes proposals per question, and a winner always belongs to the question it won.
      const proposals = await listProposalFacts(question, winnerId);
      return { question, winner: proposals };
    }),
  );
}

/** What `look_up_session` reads before it says anything. */
export type SessionLookupWhat = 'agenda' | 'proposals' | 'answers';

/**
 * What the tool is handed once the reads have been done.
 *
 * Kept apart from the tool itself so that shaping the answer — which is all the model ever
 * sees — stays a pure function with no database behind it.
 */
export interface SessionLookupData {
  agenda: Agenda;
  /** Set when `what` was `proposals`: the question that was read, and what was on it. */
  proposals?: { question: QuestionFacts; items: ProposalFacts[] };
  /** Set when `what` was `answers`. */
  answers?: QuestionAnswer[];
}

/** The one read the tool depends on, so a test can answer it without a database. */
export interface SessionLookupReader {
  read(what: SessionLookupWhat, question?: number): Promise<SessionLookupData | null>;
}

/** Binds the reads above to one session, for the turn being served. */
export function sessionLookupReader(sessionId: string): SessionLookupReader {
  return {
    async read(what, questionNumber) {
      const agenda = await readAgenda(sessionId);
      if (!agenda) return null;

      if (what === 'agenda') return { agenda };
      if (what === 'answers') return { agenda, answers: await readAnswers(agenda) };

      // No number means the question in front of the user, which is what "the proposals"
      // means when nobody says otherwise.
      const question =
        questionNumber === undefined
          ? agenda.current
          : agenda.questions.find((candidate) => candidate.number === questionNumber);

      // No `proposals` key: the tool reports a number that names no question, rather than
      // an empty board, which would read as "nobody has proposed anything".
      if (!question) return { agenda };

      return { agenda, proposals: { question, items: await readProposalsFor(question) } };
    },
  };
}

async function listProposalFacts(
  question: QuestionFacts,
  proposalId: string,
): Promise<ProposalFacts | null> {
  const items = await listProposals(question.id);
  const winner = items.find((item) => item.id === proposalId);
  if (!winner) return null;
  return {
    type: winner.artifactJson.type,
    summary: summarizeArtifact(winner.artifactJson),
    author: winner.authorName,
  };
}

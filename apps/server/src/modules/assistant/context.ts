// F35 — assembles what the agent knows about the session it is sitting in.
//
// Everything in the prompt is read server-side, from the same services the board itself
// reads. The client sends what is on screen, but that is used only to pick *which* of the
// server's own facts to highlight — never as a source of facts.
//
// The distinction matters because the caller controls the request body. When the prompt
// was built from `request.context`, anyone could put words in the assistant's mouth:
// invent proposals that were never made, rename the question under discussion, or claim a
// teammate said something they did not. Membership was checked, so the caller was entitled
// to *read* the board — but not to rewrite it on its way into the model.
//
// The assistant's view is strictly read-only (docs/06): it never mutates session state.
import type { AssistantContext } from '@roundtable/shared';
import { summarizeArtifact } from '@roundtable/shared';

import { getBoardForSession } from '../pinboard/index.js';
import { readAgenda, type Agenda } from './sessionLookup.js';

/**
 * Extension point for the Session / Pinboard / Voting owners.
 *
 * Register a provider from your module's `index.ts` and its lines appear in every
 * assistant prompt for that session — no change needed in the assistant module:
 *
 *   registerAssistantContextProvider({
 *     name: 'voting',
 *     async describe(sessionId) {
 *       const round = await getOpenRound(sessionId);
 *       return round ? `A ballot is open with ${round.options.length} options` : null;
 *     },
 *   });
 */
export interface AssistantContextProvider {
  name: string;
  describe(sessionId: string, userId: string): Promise<string | null>;
}

const providers: AssistantContextProvider[] = [];

export function registerAssistantContextProvider(provider: AssistantContextProvider): void {
  const existing = providers.findIndex((p) => p.name === provider.name);
  if (existing >= 0) providers.splice(existing, 1, provider);
  else providers.push(provider);
}

/** Test seam — drops every registered provider. */
export function clearAssistantContextProviders(): void {
  providers.length = 0;
}

/**
 * How many agenda lines to show before summarising the rest.
 *
 * An agenda is a handful of questions, so this is a ceiling rather than a working limit —
 * it stops a session with fifty questions on it from crowding out the conversation.
 */
const MAX_AGENDA_LINES = 20;

export interface SessionContext {
  sessionId: string;
  sessionTitle?: string;
  /** The question the board is on, needed by "Propose" (F37). */
  activeQuestionId?: string;
  /** Rendered block injected into the instructions. */
  block: string;
}

export async function buildSessionContext(
  sessionId: string,
  userId: string,
  clientHints: AssistantContext,
): Promise<SessionContext> {
  const [board, agenda] = await Promise.all([readBoard(sessionId), readAgendaSafely(sessionId)]);
  const lines: string[] = [];

  if (board?.sessionTitle) lines.push(`Session focus: ${board.sessionTitle}`);

  // The agenda and where the session has got to in it — the one piece of session state
  // that belongs in every prompt, because it is what "this question", "the last one" and
  // "what's left" all refer to, and none of those survive being looked up too late.
  if (agenda && agenda.questions.length > 0) lines.push(...describeAgenda(agenda));

  if (board?.questionText) {
    lines.push(`The question being discussed right now: ${board.questionText}`);
    if (board.questionStatus) lines.push(`Its phase: ${board.questionStatus}`);
  }

  if (board) {
    // A count, not the notes themselves. The detail is a `look_up_session` call away, and
    // putting twelve summaries in every prompt spent the context window on something most
    // turns never refer to. The count stays because its *absence* is what misleads: told
    // nothing, the model treats "there are three stickies" from earlier chat as still true.
    lines.push(
      board.items.length === 0
        ? 'The pinboard for this question is empty — 0 proposals on it. If earlier messages in this conversation mention proposals, they have been removed and must not be treated as still there.'
        : `The pinboard for this question holds ${board.items.length} proposal${board.items.length === 1 ? '' : 's'}. Use look_up_session to read them; do not rely on what an earlier message in this conversation said was there.`,
    );

    const selected = board.items.find((item) => item.id === clientHints.selectedProposalId);
    if (selected) {
      lines.push(
        `The user has this one selected: [${selected.artifactJson.type}] ${summarizeArtifact(selected.artifactJson)} — ${selected.authorName}`,
      );
    }
  }

  for (const provider of providers) {
    try {
      const described = await provider.describe(sessionId, userId);
      if (described) lines.push(described);
    } catch (cause) {
      // A broken provider must not break the chat.
      console.warn(`assistant: context provider "${provider.name}" failed`, cause);
    }
  }

  if (lines.length === 0) {
    lines.push('No session details are available yet — ask the user what they are working on.');
  }

  return {
    sessionId,
    ...(board?.sessionTitle ? { sessionTitle: board.sessionTitle } : {}),
    ...(board?.questionId ? { activeQuestionId: board.questionId } : {}),
    block: lines.join('\n'),
  };
}

/**
 * The agenda, numbered as the user sees it, with the live question marked.
 *
 * Statuses are given in the board's own words — pending, discussion, voting, answered,
 * skipped — rather than translated, so that "skipped" cannot be softened into "not
 * answered yet" by the time the model reads it.
 */
function describeAgenda(agenda: Agenda): string[] {
  const shown = agenda.questions.slice(0, MAX_AGENDA_LINES);
  const omitted = agenda.questions.length - shown.length;

  const lines = [
    `Agenda, ${agenda.questions.length} question${agenda.questions.length === 1 ? '' : 's'} in order:`,
  ];

  for (const question of shown) {
    const here = question.isCurrent ? ' ← the team is on this one now' : '';
    lines.push(`  ${question.number}. [${question.status}] ${question.text}${here}`);
  }

  if (omitted > 0) lines.push(`  …and ${omitted} more. Use look_up_session to read them.`);

  return lines;
}

/**
 * Reads the board, tolerating failure.
 *
 * A session that has no open question, or a database hiccup, should cost the assistant its
 * context rather than cost the user their turn.
 */
async function readBoard(
  sessionId: string,
): Promise<Awaited<ReturnType<typeof getBoardForSession>> | null> {
  try {
    return await getBoardForSession(sessionId);
  } catch (cause) {
    console.warn('assistant: could not read the board for context', cause);
    return null;
  }
}

/** Tolerated for the same reason the board is: context is worth less than the turn. */
async function readAgendaSafely(sessionId: string): Promise<Agenda | null> {
  try {
    return await readAgenda(sessionId);
  } catch (cause) {
    console.warn('assistant: could not read the agenda for context', cause);
    return null;
  }
}

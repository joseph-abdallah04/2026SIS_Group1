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
import type { AssistantContext, BoardItem } from '@roundtable/shared';
import { summarizeArtifact } from '@roundtable/shared';

import { getBoardForSession } from '../pinboard/index.js';

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

/** How many proposals to describe. Beyond this the prompt costs more than it informs. */
const MAX_DESCRIBED_PROPOSALS = 12;

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
  const board = await readBoard(sessionId);
  const lines: string[] = [];

  if (board?.sessionTitle) lines.push(`Session focus: ${board.sessionTitle}`);

  if (board?.questionText) {
    lines.push(`Current question being discussed: ${board.questionText}`);
    if (board.questionStatus) lines.push(`Current phase: ${board.questionStatus}`);
  }

  if (board) {
    if (board.items.length > 0) {
      lines.push(...describeProposals(board.items, clientHints.selectedProposalId));
    } else {
      // Always say so. Omitting this line made the model treat earlier chat
      // ("there are three stickies") as still true after the user cleared the board.
      lines.push(
        'The pinboard is empty — there are currently 0 proposals on it. If earlier messages in this conversation mention proposals, they have been removed and must not be treated as still there.',
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
 * Describes the board, newest last.
 *
 * `selectedProposalId` is the one thing taken from the client — it is a statement about
 * the user's screen, not about the session. It is only ever used to annotate a proposal
 * the server already read, so a forged id annotates nothing.
 */
function describeProposals(items: BoardItem[], selectedProposalId: string | undefined): string[] {
  const recent = items.slice(-MAX_DESCRIBED_PROPOSALS);
  const omitted = items.length - recent.length;

  const lines = [
    omitted > 0
      ? `Proposals on the pinboard (${items.length} total, showing the ${recent.length} most recent):`
      : 'Proposals on the pinboard:',
  ];

  for (const item of recent) {
    const selected = item.id === selectedProposalId ? ' (the user has this one selected)' : '';
    lines.push(
      `  - [${item.type}] ${summarizeArtifact(item.artifactJson)} — ${item.authorName}${selected}`,
    );
  }

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

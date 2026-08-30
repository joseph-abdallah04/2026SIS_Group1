// F35 — assembles what the agent knows about the session it is sitting in.
//
// Two sources, deliberately:
//   1. The client sends what is on screen (active question, selected proposal, recent
//      proposals). It is the only place that knows what the user is looking at.
//   2. The server reads what it can verify (the session row today; questions and proposals
//      once those modules exist) via the provider registry below.
//
// The assistant's view is strictly read-only (docs/06): it never mutates session state.
import type { AssistantContext } from '@roundtable/shared';

import { prisma } from '../../db.js';

/**
 * Extension point for the Session / Pinboard / Voting owners.
 *
 * Register a provider from your module's `index.ts` and its lines appear in every
 * assistant prompt for that session — no change needed in the assistant module:
 *
 *   registerAssistantContextProvider({
 *     name: 'agenda',
 *     async describe(sessionId) {
 *       const q = await getActiveQuestion(sessionId);
 *       return q ? `Active question: ${q.text} (phase: ${q.phase})` : null;
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

export interface SessionContext {
  sessionId: string;
  sessionTitle?: string;
  /** Rendered block injected into the system prompt. */
  block: string;
}

export async function buildSessionContext(
  sessionId: string,
  userId: string,
  clientContext: AssistantContext,
): Promise<SessionContext> {
  const lines: string[] = [];

  const session = await readSession(sessionId);
  const title = session?.title ?? clientContext.sessionTitle;

  if (title) lines.push(`Session focus: ${title}`);
  if (session?.status) lines.push(`Session status: ${session.status}`);

  if (clientContext.activeQuestion) {
    lines.push(`Current question being discussed: ${clientContext.activeQuestion}`);
  }
  if (clientContext.phase) {
    lines.push(`Current phase: ${clientContext.phase}`);
  }

  const proposals = clientContext.recentProposals ?? [];
  if (proposals.length > 0) {
    lines.push('Recent proposals on the pinboard:');
    for (const proposal of proposals) {
      const author = proposal.authorName ? ` — ${proposal.authorName}` : '';
      const selected =
        proposal.id === clientContext.selectedProposalId ? ' (the user has this one selected)' : '';
      lines.push(`  - [${proposal.type}] ${proposal.summary}${author}${selected}`);
    }
  } else if (clientContext.recentProposalIds?.length) {
    lines.push(`${clientContext.recentProposalIds.length} proposals are on the pinboard.`);
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
    ...(title ? { sessionTitle: title } : {}),
    block: lines.join('\n'),
  };
}

/**
 * Reads the session row if it exists.
 *
 * Tolerant on purpose: the sessions module is still being built, so a missing row (or a
 * database that is not reachable in a local dev setup) degrades the assistant's context
 * rather than failing the request.
 */
async function readSession(sessionId: string): Promise<{ title: string; status: string } | null> {
  try {
    return await prisma.session.findUnique({
      where: { id: sessionId },
      select: { title: true, status: true },
    });
  } catch (cause) {
    console.warn('assistant: could not read session for context', cause);
    return null;
  }
}

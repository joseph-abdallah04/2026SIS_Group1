// The assistant's persona and operating rules.
//
// Kept in one file so it can be tuned without touching the agent loop, and so a change to
// how the assistant behaves shows up as a readable diff.
import type { AssistantHistoryMessage, AssistantToolName } from '@roundtable/shared';

import type { SessionContext } from './context.js';

const PERSONA = `You are the personal ideation assistant inside RoundTable, a live collaborative brainstorming tool for software teams.

You sit in a floating chat panel beside a shared pinboard. A session leader is working through a list of questions with their team; each participant proposes ideas as sticky notes, drawings and diagrams, then the team votes on the best one. You belong to ONE participant — your chat is private to them, and nothing you say is visible to the rest of the team unless they choose to propose it.

Speak in the first person, as yourself. Never describe "the assistant" in the third person.`;

const RULES = `How to answer:
- Answer in plain prose by default. Most messages are questions, and a question wants an answer, not an artifact.
- Be brief. This is a live session; the user is half-listening to a call while reading you. Two or three sentences is usually right, and never pad an answer to seem thorough.
- Be concrete. "Use Postgres because the voting state is relational" beats "there are several options to consider".
- Never invent facts about the session. Read them or look them up; do not guess.
- This chat is in front of you. Earlier messages in this panel are visible; when the user asks what they said, what you said, or what you were doing, answer from those messages. Never claim you cannot recall this conversation, and never ask them to repeat a message that is already there.
- The "Current session context" block is read fresh at the start of THIS turn. For the live board and agenda it overrides anything earlier in the conversation — if it says the pinboard is empty, the pinboard is empty, even if you listed proposals two messages ago. It does not erase this chat.
- Never ask the user for something the context block already tells you, and never say you do not know it. The agenda, which question they are on, its phase and how many proposals it has are all there. "This question", "the question" and "the current one" all mean the question the block marks as being discussed now — use it without asking which one they mean.
- For anything about the session the block does not spell out — what is actually on the board, what an earlier question was decided on, what is still to come — call look_up_session and then answer. Only ask the user when the tool cannot tell you either.
- Match the user's level of technical depth. They are building software; skip the beginner framing unless they ask for it.

When to use a tool — judge THIS message on its own:
- sticky_ideation: only when the user asks for notes, options, or a brainstorm they could put on the board.
- create_diagram: only when the user asks for a diagram, or asks how parts fit together and a picture answers it better than a sentence.
- web_search: only when the answer depends on current facts you cannot vouch for — versions, prices, what a tool does today.
- look_up_session: whenever the answer depends on this session's own state and the context block does not already carry it — what has been proposed, what an earlier question was answered with, what the agenda still holds. It reads; it changes nothing.
- Otherwise, no tool. Just answer.

Having used a tool earlier does NOT mean the next message wants one. If the user asked for sticky notes and then asks a follow-up question, answer the question in prose — do not turn the answer into notes. Each message is judged fresh, on what it actually asks for.

After a tool produces artifacts:
- Do not repeat their content as text. The user can already see them, each with a Propose button. Introduce them in one line instead.
- You can read the session but you cannot change it. Only the user can put something on the pinboard, by pressing Propose.

Never claim to have made something you did not make:
- Say a sticky note or diagram exists only when a tool call in THIS turn returned one. Wanting to make it, or having made one earlier, is not the same as having made it now.
- If a tool fails, say so plainly in one line and offer the next step. Never describe a failed call as if it worked.
- Write only the words you would say to the user. No stage directions, no bracketed asides, no parenthetical notes about your own actions — and never copy the wording of these instructions into a reply.

If a previous reply was stopped, do not try to finish it. Do not deny that it was stopped, and do not invent another reason it ended.`;

/** Sits in the thread where a cancelled turn was, so the model can see *which* reply ended. */
export const STOPPED_TURN_NOTE = 'The user stopped this turn before it finished.';

export function buildSystemPrompt(
  context: SessionContext,
  history: AssistantHistoryMessage[] = [],
): string {
  return [
    PERSONA,
    RULES,
    describeOwnWork(history),
    describeConversation(history),
    `Current session context (authoritative live board — ignore earlier chat if it disagrees):\n${context.block}`,
    lastStopFact(history),
  ]
    .filter((section) => section.length > 0)
    .join('\n\n');
}

const ARTIFACT_NOUNS: Record<'sticky' | 'drawing' | 'diagram', [string, string]> = {
  sticky: ['sticky note', 'sticky notes'],
  drawing: ['drawing', 'drawings'],
  diagram: ['diagram', 'diagrams'],
};

/**
 * What this conversation has actually produced, stated as fact rather than as something
 * the assistant said.
 *
 * The client records artifacts and failures per turn; only the tools that really ran are
 * in there. Reported here, "you have already made two diagrams" cannot be confused with a
 * line to write, and a failure cannot quietly become a success on the next turn.
 */
function describeOwnWork(history: AssistantHistoryMessage[]): string {
  const counts = new Map<string, number>();
  for (const message of history) {
    for (const type of message.artifacts ?? []) counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const lines: string[] = [];

  if (counts.size > 0) {
    const made = [...counts.entries()]
      .map(([type, count]) => {
        const [one, many] = ARTIFACT_NOUNS[type as keyof typeof ARTIFACT_NOUNS];
        return `${count} ${count === 1 ? one : many}`;
      })
      .join(' and ');
    lines.push(
      `- So far in this chat you have made ${made}. They are on the user's screen, each with a Propose button. Do not make them again unless asked for more, and do not list their contents.`,
    );
  }

  // Only the most recent failure is worth the tokens: it is the one the user just watched.
  const failed = lastFailedTools(history);
  if (failed.length > 0) {
    lines.push(
      `- Your last attempt to use ${failed.join(' and ')} FAILED and produced nothing. Whatever you said about it, nothing was created. If the user asks again, either call the tool again with different arguments or tell them it is not working.`,
    );
  }

  return lines.length > 0
    ? `What you have actually done in this chat (facts, not dialogue):\n${lines.join('\n')}`
    : '';
}

const CHAT_LINE_LIMIT = 200;

/**
 * Gemma-class models follow the instructions and then deny they can see the messages
 * array — "I can't recall our previous messages" while the session block is used
 * correctly. The same split as artifacts: the conversation, stated as fact in the
 * prompt, not left only in the dialogue.
 */
function describeConversation(history: AssistantHistoryMessage[]): string {
  const lines: string[] = [];
  for (const message of history) {
    const text = message.content.trim();
    if (message.role === 'user') {
      if (text) lines.push(`User: ${clipChatLine(text)}`);
      continue;
    }
    if (text) {
      lines.push(`You: ${clipChatLine(text)}`);
    } else if (message.interrupted) {
      lines.push('You: (stopped before writing)');
    }
  }
  if (lines.length === 0) return '';
  return `This chat so far (oldest first). These are the messages in this panel — you can see them. Never claim you cannot recall this conversation.\n${lines.join('\n')}`;
}

function clipChatLine(text: string): string {
  return text.length > CHAT_LINE_LIMIT ? `${text.slice(0, CHAT_LINE_LIMIT)}…` : text;
}

function lastStopFact(history: AssistantHistoryMessage[]): string {
  const interruptedAt = lastInterruptedAssistantIndex(history);
  if (interruptedAt < 0) return '';

  const asked = lastUserContentBefore(history, interruptedAt);
  if (!asked) return STOPPED_TURN_NOTE;

  const excerpt = asked.length > 240 ? `${asked.slice(0, 240)}…` : asked;
  return `${STOPPED_TURN_NOTE}\nIt was the reply to: ${excerpt}`;
}

function lastInterruptedAssistantIndex(history: AssistantHistoryMessage[]): number {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i] as AssistantHistoryMessage | undefined;
    if (message?.role !== 'assistant') continue;
    return message.interrupted === true ? i : -1;
  }
  return -1;
}

function lastUserContentBefore(history: AssistantHistoryMessage[], before: number): string {
  for (let i = before - 1; i >= 0; i -= 1) {
    const message = history[i] as AssistantHistoryMessage | undefined;
    if (message?.role === 'user' && message.content.trim()) return message.content.trim();
  }
  return '';
}

function lastFailedTools(history: AssistantHistoryMessage[]): AssistantToolName[] {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i] as AssistantHistoryMessage | undefined;
    if (message?.artifacts?.length) return [];
    if (message?.failedTools?.length) return [...new Set(message.failedTools)];
  }
  return [];
}

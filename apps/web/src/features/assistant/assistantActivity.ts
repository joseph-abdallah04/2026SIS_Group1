// One-line status for the current action of the turn: a tool verb, or "Thinking"
// when the model is actually streaming a reasoning channel. "The agent is busy"
// is the stop button, not this line.
import type { AssistantToolName } from '@roundtable/shared';

import type { ChatEntry } from './useAssistantChat';

export const TOOL_ACTIVITY_LABELS: Record<AssistantToolName, { running: string; done: string }> = {
  web_search: { running: 'Searching the web', done: 'Searched the web' },
  create_diagram: { running: 'Drawing a diagram', done: 'Drew a diagram' },
  sticky_ideation: { running: 'Writing sticky notes', done: 'Wrote sticky notes' },
};

/**
 * Local tools (stickies, layout) finish in a handful of milliseconds. Without a floor
 * the status line never survives a paint — especially when React batches the running
 * frame with the artifacts that follow it.
 */
export const MIN_TOOL_ACTIVITY_MS = 700;

export interface ActivityHold {
  label: string;
  until: number;
}

/**
 * Compact label for the live status line, or null when nothing should show.
 *
 * A tool named this turn stays the current action until the reply starts typing —
 * including across a later reasoning burst. "Thinking" is only returned when the
 * provider is streaming a reasoning channel *and* this turn has not called a tool yet.
 */
export function assistantActivityLabel(
  entries: ChatEntry[],
  streaming: boolean,
  thinking: boolean,
): string | null {
  if (!streaming) return null;

  const turn = turnEntries(entries);
  const last = turn[turn.length - 1];
  if (last?.kind === 'assistant' && last.streaming && last.text.length > 0) return null;

  const tool = turnToolActivityLabel(entries);
  if (tool) return tool;
  if (thinking) return 'Thinking';
  return null;
}

/**
 * Tool verb for this turn, ignoring whether the reply has started. Used to hold the
 * status line long enough to read when running→done→text land in one paint.
 */
export function turnToolActivityLabel(entries: ChatEntry[]): string | null {
  const tools = turnEntries(entries).filter(
    (entry): entry is Extract<ChatEntry, { kind: 'tool' }> => entry.kind === 'tool',
  );
  const running = tools.filter((entry) => entry.status === 'running');

  if (running.length === 1) return TOOL_ACTIVITY_LABELS[running[0]!.toolName].running;
  if (running.length > 1) return `Called ${running.length} tools`;
  if (tools.length >= 2) return `Called ${tools.length} tools`;
  if (tools.length === 1) return TOOL_ACTIVITY_LABELS[tools[0]!.toolName].running;
  return null;
}

/**
 * Keeps a tool verb on screen for `MIN_TOOL_ACTIVITY_MS` after it first appears, even
 * if the derived label has already moved on to Thinking, the reply, or nothing.
 */
export function nextHeldActivity(
  desired: string | null,
  fallbackTool: string | null,
  streaming: boolean,
  now: number,
  hold: ActivityHold | null,
): { shown: string | null; hold: ActivityHold | null } {
  if (!streaming) return { shown: null, hold: null };

  const toolNow = desired !== null && desired !== 'Thinking' ? desired : null;
  if (toolNow) {
    const until = hold?.label === toolNow ? hold.until : now + MIN_TOOL_ACTIVITY_MS;
    return { shown: toolNow, hold: { label: toolNow, until } };
  }

  if (hold && now < hold.until) {
    return { shown: hold.label, hold };
  }

  // Expired hold stays put so a still-present fallback does not start a second flash.
  if (hold) {
    return { shown: desired, hold };
  }

  if (fallbackTool) {
    return {
      shown: fallbackTool,
      hold: { label: fallbackTool, until: now + MIN_TOOL_ACTIVITY_MS },
    };
  }

  return { shown: desired, hold: null };
}

export function activityHoldsEqual(a: ActivityHold | null, b: ActivityHold | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.label === b.label && a.until === b.until;
}

/** Tool chips that would duplicate the status line, or the artifact cards below them. */
export function shouldRenderToolEntry(
  entry: Extract<ChatEntry, { kind: 'tool' }>,
  streaming: boolean,
): boolean {
  if (entry.status === 'failed') return true;
  if (entry.status === 'running') return false;
  if (entry.toolName === 'web_search' && (entry.results?.length ?? 0) > 0) return true;
  return streaming ? false : entry.toolName === 'web_search';
}

function turnEntries(entries: ChatEntry[]): ChatEntry[] {
  const lastUser = findLastIndex(entries, (entry) => entry.kind === 'user');
  return lastUser === -1 ? entries : entries.slice(lastUser + 1);
}

function findLastIndex(entries: ChatEntry[], predicate: (entry: ChatEntry) => boolean): number {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (predicate(entries[i] as ChatEntry)) return i;
  }
  return -1;
}

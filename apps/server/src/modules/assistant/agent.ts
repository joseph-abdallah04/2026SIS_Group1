// The tool-calling loop: one user message in, a stream of events out.
//
// Shape of a turn:
//   instructions (persona + session context)
//   ... prior turns ...
//   user message
//   → model streams text and/or asks for tools
//   → tools run, their results go back to the model
//   → repeat until the model answers without asking for a tool, or we hit MAX_STEPS
//
// The loop itself, the wire format, tool-call reassembly, retries and the step ceiling all
// belong to the AI SDK. What lives here is the translation between its stream and the
// frames the chat panel understands, plus the judgement calls the SDK has no opinion on:
// what to show when a model answers with nothing, and when a turn has gone on long enough.
//
// Nothing here writes to the database or to a socket. The assistant reads session state
// and produces artifacts; only the user can put one on the pinboard (docs/02 §8.8).
import { randomUUID } from 'node:crypto';

import type {
  AssistantHistoryMessage,
  AssistantStreamEvent,
  AssistantUsage,
} from '@roundtable/shared';
import { streamText, stepCountIs, type LanguageModel, type ModelMessage, type ToolSet } from 'ai';

import { isAssistantToolName, type ToolOutcomeSink } from './tools/index.js';

/**
 * Ceiling on model round trips in a single turn. Four is enough for the realistic chains
 * (search → diagram, search → search → answer) and bounds the cost of a model that gets
 * stuck calling the same tool forever — the user is paying for these tokens.
 */
export const MAX_STEPS = 4;

/**
 * Time budgets. Without these a provider that accepts the connection and then goes quiet
 * holds an SSE stream, a database connection and the user's attention open indefinitely.
 */
const TIMEOUTS = {
  /** The whole turn, including every step and every tool call. */
  totalMs: 120_000,
  /** Provider accepted the request but has sent nothing back. */
  firstChunkMs: 30_000,
  /** Provider went quiet part-way through a reply. */
  chunkMs: 30_000,
  /** A single tool call. Web search has its own, shorter, budget. */
  toolMs: 20_000,
} as const;

/** Transient provider failures (429, 5xx, dropped connection) are worth one more go. */
const MAX_RETRIES = 2;

export type TurnEndReason = 'complete' | 'max-steps' | 'aborted';

export interface TurnOutcome {
  reason: TurnEndReason;
  usage: AssistantUsage;
}

export interface TurnTools {
  toolSet: ToolSet;
  sink: ToolOutcomeSink;
}

export interface RunAssistantTurnOptions {
  model: LanguageModel;
  instructions: string;
  history: AssistantHistoryMessage[];
  message: string;
  emit: (event: AssistantStreamEvent) => void;
  signal: AbortSignal;
  maxSteps?: number;
  maxOutputTokens?: number;
  /** Tools for this turn, paired with the sink they report through. */
  tools: TurnTools;
  /**
   * Called exactly once with the turn's final usage, however the turn ended.
   *
   * A turn that fails at step three still spent steps one and two, and the user is still
   * billed for them, so usage has to escape by a path an exception does not close.
   */
  onUsage?: (usage: AssistantUsage) => void;
}

/**
 * Turns the client's history into the conversation the model actually reads.
 *
 * Empty turns are omitted — they are not dialogue. A cancelled turn still has to be
 * explained, but this provider rejects `system` messages beside `instructions`, so that
 * fact lives in the prompt (see `STOPPED_TURN_NOTE`) rather than in this list. Partial
 * text from a stopped reply is kept, so a cut-off sentence is visible as a cut-off sentence.
 */
export function toModelMessages(
  history: AssistantHistoryMessage[],
  message: string,
): ModelMessage[] {
  const messages: ModelMessage[] = history
    .filter((entry) => entry.content.trim().length > 0)
    .map((entry): ModelMessage => ({ role: entry.role, content: entry.content }));
  messages.push({ role: 'user', content: message });
  return messages;
}

export async function runAssistantTurn(options: RunAssistantTurnOptions): Promise<TurnOutcome> {
  const { model, instructions, history, message, emit, signal, tools } = options;
  const maxSteps = options.maxSteps ?? MAX_STEPS;
  const startedAt = Date.now();

  if (signal.aborted) {
    const usage = emptyUsage(startedAt);
    options.onUsage?.(usage);
    return { reason: 'aborted', usage };
  }

  const messages = toModelMessages(history, message);

  const result = streamText({
    model,
    instructions,
    messages,
    tools: tools.toolSet,
    stopWhen: stepCountIs(maxSteps),
    abortSignal: signal,
    maxRetries: MAX_RETRIES,
    timeout: TIMEOUTS,
    ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
    temperature: 0.7,
  });

  let textLength = 0;
  let reasoningText = '';
  let thinkingAnnounced = false;
  let finishReason: string | undefined;
  let steps = 0;
  let aborted = false;
  // tool-input-start and tool-call are the same call at two moments. Announce once,
  // on the earlier frame, so the panel can name the tool while arguments still stream.
  const announcedTools = new Set<string>();

  const announceTool = (toolName: string, id: string, args: Record<string, unknown> = {}) => {
    if (!isAssistantToolName(toolName) || announcedTools.has(id)) return;
    announcedTools.add(id);
    thinkingAnnounced = false;
    emit({ type: 'tool', toolName, status: 'running', args });
  };

  // Per-step totals are summed as they arrive so a turn that dies mid-loop still knows
  // what it spent. The `finish` part's total supersedes them when it arrives, because the
  // provider's own arithmetic is the one the bill will be based on.
  const perStep = new TokenTally();
  let reportedTotal: TokenCounts | undefined;

  const currentUsage = (): AssistantUsage => ({
    ...(reportedTotal ?? perStep.counts()),
    steps,
    durationMs: Date.now() - startedAt,
  });

  try {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          if (part.text.length === 0) break;
          textLength += part.text.length;
          thinkingAnnounced = false;
          emit({ type: 'message', role: 'assistant', content: part.text });
          break;
        }

        // The visible reply never includes the chain of thought. A `status` frame is
        // enough for the panel to say "Thinking" — and only then, for models that
        // actually stream a reasoning channel.
        case 'reasoning-start':
        case 'reasoning-delta': {
          if (part.type === 'reasoning-delta') reasoningText += part.text;
          if (!thinkingAnnounced) {
            thinkingAnnounced = true;
            emit({ type: 'status', phase: 'thinking' });
          }
          break;
        }

        // The name is known as soon as argument streaming starts — often a second or
        // more before the JSON is finished and the tool actually runs. Waiting for
        // `tool-call` is why the panel used to say "Thinking" through the whole wait
        // and flash the verb only after the artifact was already on screen.
        case 'tool-input-start': {
          announceTool(part.toolName, part.id);
          break;
        }

        // A model that invents a tool name produces a call we have no frame type for. The
        // SDK still tells the model that tool does not exist, so the turn recovers; the
        // panel just does not show a chip for something that never ran.
        // Providers that skip argument streaming only emit this frame; `announceTool`
        // no-ops when `tool-input-start` already recorded the same id.
        case 'tool-call': {
          announceTool(part.toolName, part.toolCallId, isRecord(part.input) ? part.input : {});
          break;
        }

        case 'tool-result': {
          const outcome = tools.sink.take(part.toolCallId);
          if (!isAssistantToolName(part.toolName)) break;
          // Artifacts go out before the result chip so the panel can render them under
          // the tool that made them.
          for (const artifact of outcome?.artifacts ?? []) {
            emit({ type: 'artifact', artifactId: randomUUID(), source: part.toolName, artifact });
          }
          emit({
            type: 'tool-result',
            toolName: part.toolName,
            ok: outcome?.ok ?? true,
            summary: outcome?.summary ?? 'Done',
            ...(outcome?.results ? { results: outcome.results } : {}),
          });
          break;
        }

        // The SDK could not run the call at all — arguments it could not repair, or a tool
        // that threw past its own guard. It still reports the failure to the model, so the
        // turn carries on; the user just sees a failed chip.
        case 'tool-error': {
          tools.sink.take(part.toolCallId);
          if (!isAssistantToolName(part.toolName)) break;
          emit({
            type: 'tool-result',
            toolName: part.toolName,
            ok: false,
            summary: describeToolError(part.error),
          });
          break;
        }

        case 'finish-step': {
          steps += 1;
          perStep.add(part.usage);
          break;
        }

        case 'finish': {
          finishReason = part.finishReason;
          reportedTotal = readCounts(part.totalUsage);
          break;
        }

        case 'abort': {
          aborted = true;
          break;
        }

        // A provider error mid-stream. Throwing hands it to the route, which turns it into
        // an `error` frame followed by `done` — the stream never just stops.
        case 'error': {
          throw part.error;
        }

        default:
          break;
      }
    }
  } finally {
    options.onUsage?.(currentUsage());
  }

  const usage = currentUsage();

  if (aborted || signal.aborted) {
    return { reason: 'aborted', usage };
  }

  // The model still wanted tools when the step ceiling cut it off. Say so, rather than
  // leaving the panel with a half-finished thought.
  if (finishReason === 'tool-calls') {
    emit({
      type: 'message',
      role: 'assistant',
      content:
        '\n\n_(I stopped after several tool calls without reaching an answer — try narrowing the question.)_',
    });
    return { reason: 'max-steps', usage };
  }

  // A turn that writes nothing renders as a question with no answer under it and no
  // error — indistinguishable from a broken app. Every turn must say something.
  if (textLength === 0) {
    emit({
      type: 'message',
      role: 'assistant',
      content: recoverEmptyReply(reasoningText, finishReason),
    });
  }

  return { reason: 'complete', usage };
}

/**
 * What to show when the model finished without writing an answer.
 *
 * If it streamed its thinking on a reasoning channel, that thinking *is* the answer in this
 * failure mode, so it is better shown than swallowed. Otherwise explain the silence — an
 * empty panel reads as a broken app, and the most common cause (the token budget going
 * entirely on reasoning) is something the user can act on.
 */
function recoverEmptyReply(reasoningText: string, finishReason: string | undefined): string {
  const thinking = reasoningText.trim();
  if (thinking) return thinking;
  if (finishReason === 'length') {
    return '_(The model ran out of tokens before writing an answer — try a shorter question, or raise the output limit on your provider.)_';
  }
  return '_(The model returned an empty reply. Try asking again — if it keeps happening, a different model on the same provider usually fixes it.)_';
}

// ---------------------------------------------------------------------------
// Token accounting
// ---------------------------------------------------------------------------

/**
 * Counts as the provider reported them. `undefined` means "not reported" and has to stay
 * distinguishable from zero all the way to the invoice — a BYO provider that reports
 * nothing must never read as a turn that cost nothing.
 */
interface TokenCounts {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

/** The subset of the SDK's usage shape this file reads. */
interface SdkUsage {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
  inputTokenDetails?: { cacheReadTokens?: number | undefined } | undefined;
  outputTokenDetails?: { reasoningTokens?: number | undefined } | undefined;
}

/** Sums per-step usage, keeping "not reported" distinct from zero. */
class TokenTally {
  private readonly totals = new Map<keyof TokenCounts, number>();

  add(usage: SdkUsage): void {
    const counts = readCounts(usage);
    for (const [key, value] of Object.entries(counts) as Array<[keyof TokenCounts, number]>) {
      this.totals.set(key, (this.totals.get(key) ?? 0) + value);
    }
  }

  counts(): TokenCounts {
    return Object.fromEntries(this.totals) as TokenCounts;
  }
}

function readCounts(usage: SdkUsage): TokenCounts {
  const reasoningTokens = usage.outputTokenDetails?.reasoningTokens;
  const cachedInputTokens = usage.inputTokenDetails?.cacheReadTokens;

  return {
    ...(isCount(usage.inputTokens) ? { inputTokens: usage.inputTokens } : {}),
    ...(isCount(usage.outputTokens) ? { outputTokens: usage.outputTokens } : {}),
    ...(isCount(usage.totalTokens) ? { totalTokens: usage.totalTokens } : {}),
    ...(isCount(reasoningTokens) ? { reasoningTokens } : {}),
    ...(isCount(cachedInputTokens) ? { cachedInputTokens } : {}),
  };
}

function emptyUsage(startedAt: number): AssistantUsage {
  return { steps: 0, durationMs: Date.now() - startedAt };
}

function isCount(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * One line for the failed chip. Every one of these used to read "Tool failed", which hid
 * the only failure that happens in practice — a model filling in arguments the schema
 * rejects — behind the same words as a tool that crashed.
 */
function describeToolError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'AI_InvalidToolInputError' || name === 'InvalidToolInputError') {
    return 'Invalid arguments';
  }
  if (name === 'AI_NoSuchToolError' || name === 'NoSuchToolError') return 'No such tool';
  return 'Tool failed';
}

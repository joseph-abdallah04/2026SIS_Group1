// The tool-calling loop: one user message in, a stream of events out.
//
// Shape of a turn:
//   system prompt (persona + session context)
//   ... prior turns ...
//   user message
//   → model streams text and/or asks for tools
//   → tools run, their results go back as `tool` messages
//   → repeat until the model answers without asking for a tool, or we hit MAX_STEPS
//
// Nothing here writes to the database or to a socket. The assistant reads session state
// and produces artifacts; only the user can put one on the pinboard (docs/02 §8.8).
import { randomUUID } from 'node:crypto';

import type {
  AssistantHistoryMessage,
  AssistantStreamEvent,
  AssistantToolName,
  ProposalArtifact,
} from '@roundtable/shared';

import { streamChatCompletion, type LlmCredentials, type LlmMessage } from './llm.js';
import { assistantToolDefinitions, findTool } from './tools/index.js';

/**
 * Ceiling on tool round trips in a single turn. Three is enough for the realistic chains
 * (search → diagram, search → search → answer) and bounds the cost of a model that gets
 * stuck calling the same tool forever — the user is paying for these tokens.
 */
export const MAX_STEPS = 4;

export type TurnEndReason = 'complete' | 'max-steps' | 'aborted';

export interface RunAssistantTurnOptions {
  credentials: LlmCredentials;
  systemPrompt: string;
  history: AssistantHistoryMessage[];
  message: string;
  emit: (event: AssistantStreamEvent) => void;
  signal: AbortSignal;
  maxSteps?: number;
}

export async function runAssistantTurn(options: RunAssistantTurnOptions): Promise<TurnEndReason> {
  const { credentials, systemPrompt, history, message, emit, signal } = options;
  const maxSteps = options.maxSteps ?? MAX_STEPS;

  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((entry): LlmMessage => ({ role: entry.role, content: entry.content })),
    { role: 'user', content: message },
  ];

  for (let step = 0; step < maxSteps; step += 1) {
    if (signal.aborted) return 'aborted';

    let assistantText = '';
    let toolCalls: Awaited<ReturnType<typeof collectTurn>>['toolCalls'] = [];

    const turn = await collectTurn(credentials, messages, signal, (delta) => {
      assistantText += delta;
      emit({ type: 'message', role: 'assistant', content: delta });
    });
    toolCalls = turn.toolCalls;

    if (toolCalls.length === 0) {
      return 'complete';
    }

    messages.push({
      role: 'assistant',
      content: assistantText.length > 0 ? assistantText : null,
      tool_calls: toolCalls.map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: { name: call.name, arguments: call.arguments },
      })),
    });

    for (const call of toolCalls) {
      if (signal.aborted) return 'aborted';
      const toolMessage = await executeToolCall(call, emit, signal);
      messages.push(toolMessage);
    }
  }

  // Out of steps: say so rather than leaving the panel with a half-finished thought.
  emit({
    type: 'message',
    role: 'assistant',
    content:
      '\n\n_(I stopped after several tool calls without reaching an answer — try narrowing the question.)_',
  });
  return 'max-steps';
}

async function collectTurn(
  credentials: LlmCredentials,
  messages: LlmMessage[],
  signal: AbortSignal,
  onDelta: (delta: string) => void,
): Promise<{ toolCalls: Array<{ id: string; name: string; arguments: string }> }> {
  const stream = streamChatCompletion(credentials, {
    messages,
    tools: assistantToolDefinitions,
    signal,
    temperature: 0.7,
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content') {
      onDelta(chunk.text);
    } else {
      return { toolCalls: chunk.toolCalls };
    }
  }
  return { toolCalls: [] };
}

async function executeToolCall(
  call: { id: string; name: string; arguments: string },
  emit: (event: AssistantStreamEvent) => void,
  signal: AbortSignal,
): Promise<LlmMessage> {
  const tool = findTool(call.name);
  if (!tool) {
    // The model hallucinated a tool. Tell it so, rather than failing the turn.
    return {
      role: 'tool',
      tool_call_id: call.id,
      name: call.name,
      content: `No tool named "${call.name}" exists. Available tools: web_search, create_diagram, sticky_ideation.`,
    };
  }

  const parsedArguments = parseToolArguments(call.arguments);
  emit({
    type: 'tool',
    toolName: tool.name,
    status: 'running',
    args: isRecord(parsedArguments) ? parsedArguments : {},
  });

  try {
    const result = await tool.run(parsedArguments, {
      signal,
      emitArtifact: (artifact: ProposalArtifact, source: AssistantToolName) => {
        emit({ type: 'artifact', artifactId: randomUUID(), source, artifact });
      },
    });

    emit({
      type: 'tool-result',
      toolName: tool.name,
      ok: result.ok,
      summary: result.summary,
      ...(result.results ? { results: result.results } : {}),
    });

    return { role: 'tool', tool_call_id: call.id, name: tool.name, content: result.modelText };
  } catch (cause) {
    if (signal.aborted) throw cause;
    const detail = cause instanceof Error ? cause.message : 'unknown error';
    emit({ type: 'tool-result', toolName: tool.name, ok: false, summary: 'Tool failed' });
    // Hand the failure back to the model so it can recover or explain, instead of the
    // whole turn dying on a flaky third-party call.
    return {
      role: 'tool',
      tool_call_id: call.id,
      name: tool.name,
      content: `The tool failed: ${detail}. Continue without it and tell the user what you could not do.`,
    };
  }
}

/** Models occasionally emit `""`, `null`, or truncated JSON for arguments. */
function parseToolArguments(raw: string): unknown {
  if (!raw || raw.trim().length === 0) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

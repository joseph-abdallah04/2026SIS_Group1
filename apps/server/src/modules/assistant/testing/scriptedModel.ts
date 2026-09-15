// A language model that says exactly what a test tells it to.
//
// Tests used to fake the module that spoke HTTP. Now that the AI SDK owns the wire, the
// honest seam is one level lower: a real `LanguageModelV4` that the real `streamText`
// drives. Everything between the model's first token and the SSE frame — tool dispatch,
// the step loop, usage aggregation — is the code that ships.
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';

export interface ScriptedToolCall {
  id?: string;
  name: string;
  /** Sent as the model would send it: a JSON string, or whatever a sloppy model emitted. */
  input: unknown;
}

export interface ScriptedTurn {
  /** Text the model streams. An array arrives as several deltas. */
  text?: string | string[];
  /** Thinking on the reasoning channel, which never reaches the chat as content. */
  reasoning?: string;
  toolCalls?: ScriptedToolCall[];
  /** Defaults to `tool-calls` when the turn calls tools, `stop` otherwise. */
  finishReason?: 'stop' | 'length' | 'content-filter' | 'error' | 'other' | 'tool-calls';
  usage?: { input?: number; output?: number; reasoning?: number; cached?: number };
}

/** Builds a model that plays `turns` in order, one per step of the tool loop. */
export function scriptedModel(turns: ScriptedTurn[]): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    modelId: 'scripted-model',
    doStream: turns.map((turn) => ({
      stream: simulateReadableStream({ chunks: chunksFor(turn) }),
    })),
  });
}

function chunksFor(turn: ScriptedTurn): LanguageModelV4StreamPart[] {
  const chunks: LanguageModelV4StreamPart[] = [];

  if (turn.reasoning) {
    chunks.push(
      { type: 'reasoning-start', id: 'r0' },
      { type: 'reasoning-delta', id: 'r0', delta: turn.reasoning },
      { type: 'reasoning-end', id: 'r0' },
    );
  }

  const deltas = turn.text === undefined ? [] : Array.isArray(turn.text) ? turn.text : [turn.text];
  if (deltas.length > 0) {
    chunks.push({ type: 'text-start', id: 't0' });
    for (const delta of deltas) chunks.push({ type: 'text-delta', id: 't0', delta });
    chunks.push({ type: 'text-end', id: 't0' });
  }

  (turn.toolCalls ?? []).forEach((call, index) => {
    const id = call.id ?? `call_${index}`;
    const input = typeof call.input === 'string' ? call.input : JSON.stringify(call.input);
    chunks.push(
      { type: 'tool-input-start', id, toolName: call.name },
      { type: 'tool-input-delta', id, delta: input },
      { type: 'tool-input-end', id },
      { type: 'tool-call', toolCallId: id, toolName: call.name, input },
    );
  });

  const unified = turn.finishReason ?? (turn.toolCalls?.length ? 'tool-calls' : 'stop');

  chunks.push({
    type: 'finish',
    finishReason: { unified, raw: unified },
    usage: {
      inputTokens: {
        total: turn.usage?.input,
        noCache: turn.usage?.input,
        cacheRead: turn.usage?.cached,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: turn.usage?.output,
        text: turn.usage?.output,
        reasoning: turn.usage?.reasoning,
      },
    },
  });

  return chunks;
}

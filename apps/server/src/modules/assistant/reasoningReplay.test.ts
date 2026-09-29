// A reasoning model that calls a tool, against providers that disagree about whether the
// model's own reasoning may be sent back to it.
//
// These drive the real `@ai-sdk/openai-compatible` provider through `createAssistantModel`
// — only the network is fake — because the bug lived in the wire format: the SDK writes a
// step's reasoning onto the next request as `reasoning_content`, and Groq's gpt-oss refuses
// the whole request over that one field. The scripted model used elsewhere never builds a
// request body, so it could not have caught this.
import type { AssistantStreamEvent } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { runAssistantTurn } from './agent.js';
import { forgetReasoningRefusals, withoutReplayedReasoning } from './network/reasoningReplay.js';
import { createAssistantModel } from './provider.js';
import { createAssistantTools, ToolOutcomeSink } from './tools/index.js';

type RequestBody = { model: string; messages: Array<Record<string, unknown>> };

const CREDENTIALS = {
  baseUrl: 'https://api.groq.test/openai/v1',
  apiKey: 'test-key',
  model: 'openai/gpt-oss-120b',
};

/** One streamed chunk, in the OpenAI chat-completions shape every compatible provider uses. */
function chunk(delta: Record<string, unknown>, finish: string | null = null, usage?: object) {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: CREDENTIALS.model,
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...(usage ? { usage } : {}),
  };
}

function sse(chunks: object[]): Response {
  const text = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const DIAGRAM_ARGS = JSON.stringify({
  nodes: [
    { id: 'observe', label: 'Observe' },
    { id: 'act', label: 'Act' },
  ],
  edges: [{ from: 'observe', to: 'act' }],
});

/** Step one: think on the reasoning channel (gpt-oss does, on Groq), then call a tool. */
function reasoningThenToolCall(): Response {
  return sse([
    chunk({ role: 'assistant', reasoning: 'A loop diagram answers this best.' }),
    chunk({
      tool_calls: [
        {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'create_diagram', arguments: DIAGRAM_ARGS },
        },
      ],
    }),
    chunk({}, 'tool_calls', { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }),
  ]);
}

/** Step two: the closing line after the tool result. */
function closingLine(): Response {
  return sse([
    chunk({ role: 'assistant', content: 'Here is the loop.' }),
    chunk({}, 'stop', { prompt_tokens: 150, completion_tokens: 5, total_tokens: 155 }),
  ]);
}

/** Groq's exact refusal for gpt-oss, as it appeared in the chat rail. */
const GROQ_REFUSAL =
  "'messages.2' : for 'role:assistant' the following must be satisfied[('messages.2' : property 'reasoning_content' is unsupported)]";

function hasReplayedReasoning(body: RequestBody): boolean {
  return body.messages.some(
    (message) => message.role === 'assistant' && 'reasoning_content' in message,
  );
}

/**
 * A fake provider. `refusesReasoning` makes it behave like Groq; without it, it behaves like
 * a provider that accepts (or needs) the reasoning back.
 */
function fakeProvider({ refusesReasoning }: { refusesReasoning: boolean }) {
  const bodies: RequestBody[] = [];

  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as RequestBody;
    bodies.push(body);

    if (refusesReasoning && hasReplayedReasoning(body)) {
      return new Response(
        JSON.stringify({ error: { message: GROQ_REFUSAL, type: 'invalid_request_error' } }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }

    const afterTool = body.messages.some((message) => message.role === 'tool');
    return afterTool ? closingLine() : reasoningThenToolCall();
  }) as typeof fetch;

  return { fetchImpl, bodies };
}

async function runDiagramTurn(fetchImpl: typeof fetch) {
  const events: AssistantStreamEvent[] = [];
  const sink = new ToolOutcomeSink();

  const outcome = await runAssistantTurn({
    model: createAssistantModel(CREDENTIALS, { baseFetch: fetchImpl }),
    instructions: 'system',
    history: [],
    message: 'Make a diagram for a simple agent loop',
    emit: (event) => events.push(event),
    signal: new AbortController().signal,
    tools: { toolSet: createAssistantTools(sink), sink },
  });

  const reply = events
    .filter((event) => event.type === 'message')
    .map((event) => event.content)
    .join('');

  return { outcome, events, reply };
}

describe('sending a reasoning step back to the provider', () => {
  beforeEach(() => {
    forgetReasoningRefusals();
  });

  it('finishes the turn on a provider that refuses reasoning_content (Groq gpt-oss)', async () => {
    const provider = fakeProvider({ refusesReasoning: true });

    const { outcome, events, reply } = await runDiagramTurn(provider.fetchImpl);

    expect(outcome.reason).toBe('complete');
    expect(events.some((event) => event.type === 'artifact')).toBe(true);
    expect(reply).toBe('Here is the loop.');
  });

  it('keeps the reasoning for providers that accept it', async () => {
    const provider = fakeProvider({ refusesReasoning: false });

    const { reply } = await runDiagramTurn(provider.fetchImpl);

    expect(reply).toBe('Here is the loop.');
    // Two requests, and the second still carries the reasoning: thinking models that need
    // it to continue a turn must not lose it because another provider refuses it.
    expect(provider.bodies).toHaveLength(2);
    expect(hasReplayedReasoning(provider.bodies[1]!)).toBe(true);
  });

  it('learns the refusal once, then stops sending the field to that host', async () => {
    const provider = fakeProvider({ refusesReasoning: true });

    await runDiagramTurn(provider.fetchImpl);
    // Step one, the refused step two, and step two again without the field.
    expect(provider.bodies).toHaveLength(3);

    await runDiagramTurn(provider.fetchImpl);
    // Second turn: no refused attempt — the field is left off from the start.
    expect(provider.bodies).toHaveLength(5);
    expect(hasReplayedReasoning(provider.bodies[4]!)).toBe(false);
  });

  it('does not retry other rejections', async () => {
    const bodies: RequestBody[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as RequestBody);
      if (bodies.length === 1) return reasoningThenToolCall();
      return new Response(
        JSON.stringify({ error: { message: 'messages.2.tool_calls: invalid shape' } }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    await expect(runDiagramTurn(fetchImpl)).rejects.toThrow(/invalid shape/);
    expect(bodies).toHaveLength(2);
  });
});

describe('withoutReplayedReasoning', () => {
  it('removes the field from assistant messages only', () => {
    const body = JSON.stringify({
      model: 'm',
      messages: [
        { role: 'user', content: 'what is reasoning_content?' },
        { role: 'assistant', content: null, reasoning_content: 'thinking', tool_calls: [] },
      ],
    });

    const stripped = JSON.parse(withoutReplayedReasoning(body)!) as RequestBody;

    expect(stripped.messages[0]).toEqual({ role: 'user', content: 'what is reasoning_content?' });
    expect(stripped.messages[1]).toEqual({ role: 'assistant', content: null, tool_calls: [] });
    expect(stripped.model).toBe('m');
  });

  it('leaves a request alone when there is nothing to remove', () => {
    // The user typing the word is not the model replaying its reasoning.
    const mentionsIt = JSON.stringify({
      messages: [{ role: 'user', content: 'explain "reasoning_content" to me' }],
    });
    expect(withoutReplayedReasoning(mentionsIt)).toBeNull();
    expect(withoutReplayedReasoning(JSON.stringify({ messages: [] }))).toBeNull();
    expect(withoutReplayedReasoning('{"reasoning_content": not json')).toBeNull();
    expect(withoutReplayedReasoning(undefined)).toBeNull();
  });
});

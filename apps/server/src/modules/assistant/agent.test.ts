import type { AssistantStreamEvent } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LlmStreamChunk } from './llm.js';

// Scripted provider: each entry is one model turn's worth of chunks. No network, no key.
const script: LlmStreamChunk[][] = [];
const seenMessages: unknown[][] = [];

vi.mock('./llm.js', () => ({
  streamChatCompletion: (_credentials: unknown, options: { messages: unknown[] }) => {
    seenMessages.push(options.messages);
    const turn = script.shift() ?? [{ type: 'finish', toolCalls: [], finishReason: 'stop' }];
    return (async function* () {
      for (const chunk of turn) yield chunk;
    })();
  },
}));

const { runAssistantTurn } = await import('./agent.js');

const CREDENTIALS = { baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'test-model' };

function run(signal = new AbortController().signal) {
  const events: AssistantStreamEvent[] = [];
  return {
    events,
    promise: runAssistantTurn({
      credentials: CREDENTIALS,
      systemPrompt: 'system',
      history: [],
      message: 'hello',
      emit: (event) => events.push(event),
      signal,
    }),
  };
}

beforeEach(() => {
  script.length = 0;
  seenMessages.length = 0;
});

describe('runAssistantTurn', () => {
  it('streams text deltas as separate message events', async () => {
    script.push([
      { type: 'content', text: 'Hel' },
      { type: 'content', text: 'lo.' },
      { type: 'finish', toolCalls: [], finishReason: 'stop' },
    ]);

    const { events, promise } = run();
    expect(await promise).toBe('complete');
    expect(events.filter((e) => e.type === 'message').map((e) => e.content)).toEqual([
      'Hel',
      'lo.',
    ]);
  });

  it('sends the system prompt and user message to the model', async () => {
    script.push([{ type: 'finish', toolCalls: [], finishReason: 'stop' }]);
    await run().promise;
    expect(seenMessages[0]).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'hello' },
    ]);
  });

  it('runs a tool, streams its lifecycle, and feeds the result back', async () => {
    script.push([
      {
        type: 'finish',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call_1',
            name: 'sticky_ideation',
            arguments: JSON.stringify({ ideas: [{ text: 'Use Postgres' }, { text: 'Use Redis' }] }),
          },
        ],
      },
    ]);
    script.push([
      { type: 'content', text: 'Two options above.' },
      { type: 'finish', toolCalls: [], finishReason: 'stop' },
    ]);

    const { events, promise } = run();
    expect(await promise).toBe('complete');

    expect(events.map((e) => e.type)).toEqual([
      'tool',
      'artifact',
      'artifact',
      'tool-result',
      'message',
    ]);

    const toolResult = events.find((e) => e.type === 'tool-result');
    expect(toolResult && toolResult.type === 'tool-result' && toolResult.ok).toBe(true);

    // Second call must carry the assistant tool_calls turn plus the tool's reply.
    const secondTurn = seenMessages[1] as Array<{ role: string }>;
    expect(secondTurn.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
  });

  it('gives each artifact a distinct id so Propose targets the right one', async () => {
    script.push([
      {
        type: 'finish',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call_1',
            name: 'sticky_ideation',
            arguments: JSON.stringify({ ideas: [{ text: 'A' }, { text: 'B' }] }),
          },
        ],
      },
    ]);
    script.push([{ type: 'finish', toolCalls: [], finishReason: 'stop' }]);

    const { events, promise } = run();
    await promise;
    const ids = events.filter((e) => e.type === 'artifact').map((e) => e.artifactId);
    expect(new Set(ids).size).toBe(2);
  });

  it('tells the model when it invents a tool, instead of failing the turn', async () => {
    script.push([
      {
        type: 'finish',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'call_1', name: 'summon_intern', arguments: '{}' }],
      },
    ]);
    script.push([
      { type: 'content', text: 'Sorry, I cannot do that.' },
      { type: 'finish', toolCalls: [], finishReason: 'stop' },
    ]);

    const { events, promise } = run();
    expect(await promise).toBe('complete');
    // No tool lifecycle events for a tool that does not exist.
    expect(events.some((e) => e.type === 'tool')).toBe(false);
    const toolMessage = (seenMessages[1] as Array<{ role: string; content?: string }>).at(-1);
    expect(toolMessage?.content).toMatch(/No tool named/);
  });

  it('survives malformed tool arguments', async () => {
    script.push([
      {
        type: 'finish',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'call_1', name: 'create_diagram', arguments: '{"nodes": [' }],
      },
    ]);
    script.push([{ type: 'finish', toolCalls: [], finishReason: 'stop' }]);

    const { events, promise } = run();
    expect(await promise).toBe('complete');
    const result = events.find((e) => e.type === 'tool-result');
    expect(result && result.type === 'tool-result' && result.ok).toBe(false);
  });

  it('stops after the step ceiling rather than looping forever', async () => {
    const toolTurn: LlmStreamChunk[] = [
      {
        type: 'finish',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call_x',
            name: 'sticky_ideation',
            arguments: JSON.stringify({ ideas: [{ text: 'again' }] }),
          },
        ],
      },
    ];
    for (let i = 0; i < 10; i += 1) script.push([...toolTurn]);

    const { events, promise } = run();
    expect(await promise).toBe('max-steps');
    // The user is told why it stopped.
    expect(events.filter((e) => e.type === 'message').at(-1)?.content).toMatch(/stopped/i);
  });

  it('stops immediately when the client disconnects', async () => {
    const controller = new AbortController();
    controller.abort();
    const { events, promise } = run(controller.signal);
    expect(await promise).toBe('aborted');
    expect(events).toHaveLength(0);
  });
});

import type { AssistantStreamEvent, AssistantUsage } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { runAssistantTurn } from './agent.js';
import { scriptedModel, type ScriptedTurn } from './testing/scriptedModel.js';
import { createAssistantTools, ToolOutcomeSink } from './tools/index.js';

interface RunHandle {
  events: AssistantStreamEvent[];
  /** Whatever `onUsage` last reported — the path that survives a thrown turn. */
  reported: () => AssistantUsage | undefined;
  promise: ReturnType<typeof runAssistantTurn>;
  model: ReturnType<typeof scriptedModel>;
}

function run(turns: ScriptedTurn[], signal = new AbortController().signal): RunHandle {
  const events: AssistantStreamEvent[] = [];
  const sink = new ToolOutcomeSink();
  const model = scriptedModel(turns);
  let reported: AssistantUsage | undefined;

  return {
    events,
    model,
    reported: () => reported,
    promise: runAssistantTurn({
      model,
      instructions: 'system',
      history: [],
      message: 'hello',
      emit: (event) => events.push(event),
      signal,
      tools: { toolSet: createAssistantTools(sink), sink },
      onUsage: (usage) => {
        reported = usage;
      },
    }),
  };
}

/** The text the panel would render, deltas joined. */
function reply(events: AssistantStreamEvent[]): string {
  return events
    .filter((event) => event.type === 'message')
    .map((event) => event.content)
    .join('');
}

const STICKY_CALL = {
  name: 'sticky_ideation',
  input: { ideas: [{ text: 'Use Postgres' }, { text: 'Use Redis' }] },
};

describe('runAssistantTurn', () => {
  it('streams text deltas as separate message events', async () => {
    const { events, promise } = run([{ text: ['Hel', 'lo.'] }]);

    expect((await promise).reason).toBe('complete');
    expect(events.filter((e) => e.type === 'message').map((e) => e.content)).toEqual([
      'Hel',
      'lo.',
    ]);
  });

  // A turn that emits nothing renders as a question with no answer under it and no error —
  // indistinguishable from a broken app. Every turn must produce at least one message.
  it('explains itself when the model finishes without writing anything', async () => {
    const { events, promise } = run([{}]);

    expect((await promise).reason).toBe('complete');
    const messages = events.filter((e) => e.type === 'message');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toMatch(/empty reply/i);
  });

  it('falls back to the reasoning channel when the model answers only there', async () => {
    const { events, promise } = run([{ reasoning: '  Three proposals so far: A, B and C.  ' }]);

    await promise;
    expect(reply(events)).toBe('Three proposals so far: A, B and C.');
  });

  it('names the token limit when that is what silenced the model', async () => {
    const { events, promise } = run([{ finishReason: 'length' }]);

    await promise;
    expect(reply(events)).toMatch(/ran out of tokens/i);
  });

  it('does not add a fallback when the model did write an answer', async () => {
    const { events, promise } = run([{ text: 'Two so far.', reasoning: 'thinking…' }]);

    await promise;
    expect(reply(events)).toBe('Two so far.');
  });

  it('announces Thinking only when the model streams a reasoning channel', async () => {
    const withReasoning = run([{ reasoning: 'hmm', text: 'ok' }]);
    await withReasoning.promise;
    expect(withReasoning.events.filter((event) => event.type === 'status')).toEqual([
      { type: 'status', phase: 'thinking' },
    ]);

    const without = run([{ text: 'ok' }]);
    await without.promise;
    expect(without.events.some((event) => event.type === 'status')).toBe(false);
  });

  it('sends the instructions and user message to the model', async () => {
    const { promise, model } = run([{ text: 'ok' }]);
    await promise;

    const call = model.doStreamCalls[0];
    expect(call?.prompt).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ]);
  });

  it('offers the model exactly the three tools', async () => {
    const { promise, model } = run([{ text: 'ok' }]);
    await promise;

    expect(model.doStreamCalls[0]?.tools?.map((tool) => tool.name).sort()).toEqual([
      'create_diagram',
      'sticky_ideation',
      'web_search',
    ]);
  });

  it('runs a tool, streams its lifecycle, and feeds the result back', async () => {
    const { events, promise, model } = run([
      { toolCalls: [STICKY_CALL] },
      { text: 'Two options above.' },
    ]);

    expect((await promise).reason).toBe('complete');
    expect(events.map((e) => e.type)).toEqual([
      'tool',
      'artifact',
      'artifact',
      'tool-result',
      'message',
    ]);

    const toolResult = events.find((e) => e.type === 'tool-result');
    expect(toolResult?.type === 'tool-result' && toolResult.ok).toBe(true);

    // The second call must carry the assistant's tool call plus the tool's reply.
    const secondTurn = model.doStreamCalls[1]?.prompt ?? [];
    expect(secondTurn.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
    ]);
  });

  it('announces the tool when argument streaming starts, not after the call is assembled', async () => {
    const { events, promise } = run([
      { reasoning: 'I should write notes', toolCalls: [STICKY_CALL] },
      { text: 'Two options above.' },
    ]);

    await promise;
    const types = events.map((event) => event.type);
    expect(types.indexOf('status')).toBeLessThan(types.indexOf('tool'));
    expect(types.indexOf('tool')).toBeLessThan(types.indexOf('artifact'));
    expect(types.filter((type) => type === 'tool')).toHaveLength(1);
  });

  it('gives each artifact a distinct id so Propose targets the right one', async () => {
    const { events, promise } = run([{ toolCalls: [STICKY_CALL] }, {}]);

    await promise;
    const ids = events.filter((e) => e.type === 'artifact').map((e) => e.artifactId);
    expect(new Set(ids).size).toBe(2);
  });

  it('tells the model when it invents a tool, instead of failing the turn', async () => {
    const { events, promise, model } = run([
      { toolCalls: [{ name: 'summon_intern', input: {} }] },
      { text: 'Sorry, I cannot do that.' },
    ]);

    expect((await promise).reason).toBe('complete');
    // No tool lifecycle events for a tool that does not exist.
    expect(events.some((e) => e.type === 'tool')).toBe(false);
    expect(reply(events)).toBe('Sorry, I cannot do that.');

    // The model has to learn the tool does not exist, or it will just try again.
    expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toMatch(/summon_intern/);
  });

  it('survives malformed tool arguments', async () => {
    const { events, promise } = run([
      { toolCalls: [{ name: 'create_diagram', input: '{"nodes": [' }] },
      { text: 'Let me try again.' },
    ]);

    expect((await promise).reason).toBe('complete');
    const result = events.find((e) => e.type === 'tool-result');
    expect(result?.type === 'tool-result' && result.ok).toBe(false);
  });

  it('stops after the step ceiling rather than looping forever', async () => {
    const { events, promise } = run(
      Array.from({ length: 10 }, (): ScriptedTurn => ({ toolCalls: [STICKY_CALL] })),
    );

    expect((await promise).reason).toBe('max-steps');
    // The user is told why it stopped.
    expect(reply(events)).toMatch(/stopped/i);
  });

  it('stops immediately when the client disconnects', async () => {
    const controller = new AbortController();
    controller.abort();

    const { events, promise } = run([{ text: 'should never be sent' }], controller.signal);

    expect((await promise).reason).toBe('aborted');
    expect(events).toHaveLength(0);
  });
});

describe('token accounting', () => {
  it('reports what the provider charged for a single step', async () => {
    const { promise } = run([{ text: 'hi', usage: { input: 120, output: 8, cached: 100 } }]);

    const { usage } = await promise;
    expect(usage.inputTokens).toBe(120);
    expect(usage.outputTokens).toBe(8);
    expect(usage.cachedInputTokens).toBe(100);
    expect(usage.steps).toBe(1);
  });

  it('sums every step of a tool loop, not just the last', async () => {
    const { promise } = run([
      { toolCalls: [STICKY_CALL], usage: { input: 100, output: 20 } },
      { text: 'Done.', usage: { input: 300, output: 10 } },
    ]);

    const { usage } = await promise;
    expect(usage.steps).toBe(2);
    expect(usage.inputTokens).toBe(400);
    expect(usage.outputTokens).toBe(30);
  });

  // A provider that reports nothing must not read as a turn that cost nothing: the fields
  // are absent, so a cost display can say "unknown" rather than "free".
  it('leaves counts absent when the provider reported none', async () => {
    const { promise } = run([{ text: 'hi' }]);

    const { usage } = await promise;
    expect(usage.inputTokens).toBeUndefined();
    expect(usage.totalTokens).toBeUndefined();
    expect(usage.steps).toBe(1);
  });

  it('reports usage through onUsage even when the turn is aborted before it starts', async () => {
    const controller = new AbortController();
    controller.abort();

    const handle = run([{ text: 'x' }], controller.signal);
    await handle.promise;

    expect(handle.reported()).toEqual({ steps: 0, durationMs: expect.any(Number) });
  });
});

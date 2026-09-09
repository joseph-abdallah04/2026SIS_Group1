import type { AssistantStreamEvent } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { applyEvent, type ChatEntry } from './useAssistantChat';

const delta = (content: string): AssistantStreamEvent => ({
  type: 'message',
  role: 'assistant',
  content,
});

/**
 * What React actually does in development: it calls the updater twice with the same `prev`
 * and keeps the second result. Every test here drives events through this rather than
 * calling applyEvent once, because calling it once is what hid the bug it is guarding.
 */
function reduceUnderStrictMode(events: AssistantStreamEvent[]): ChatEntry[] {
  let entries: ChatEntry[] = [];
  let counter = 0;
  for (const event of events) {
    const id = `e${(counter += 1)}`;
    const first = applyEvent(entries, event, id);
    const second = applyEvent(entries, event, id);
    expect(second).toEqual(first); // the updater must be a pure function of `prev`
    entries = second;
  }
  return entries;
}

describe('applyEvent', () => {
  it('is idempotent with respect to prev, as StrictMode requires', () => {
    const prev: ChatEntry[] = [{ kind: 'user', id: 'u1', text: 'hi' }];
    expect(applyEvent(prev, delta('Hello'), 'a1')).toEqual(applyEvent(prev, delta('Hello'), 'a1'));
  });

  it('accumulates text deltas into one bubble', () => {
    const entries = reduceUnderStrictMode([delta('The '), delta('MVP '), delta('core.')]);
    expect(entries).toEqual([
      { kind: 'assistant', id: 'e1', text: 'The MVP core.', streaming: true },
    ]);
  });

  it('renders the whole reply of a plain question', () => {
    const entries = reduceUnderStrictMode([
      delta('Two'),
      delta(' proposals.'),
      { type: 'done', reason: 'complete' },
    ]);
    expect(entries).toEqual([
      { kind: 'assistant', id: 'e1', text: 'Two proposals.', streaming: false },
    ]);
  });

  it('starts a new bubble after a tool call instead of growing the old one', () => {
    const entries = reduceUnderStrictMode([
      delta('Let me look.'),
      { type: 'tool', toolName: 'web_search', status: 'running', args: {} },
      { type: 'tool-result', toolName: 'web_search', ok: true, summary: '5 results' },
      delta('Found it.'),
    ]);

    expect(entries.map((e) => e.kind)).toEqual(['assistant', 'tool', 'assistant']);
    expect(entries[0]).toMatchObject({ text: 'Let me look.' });
    expect(entries[2]).toMatchObject({ text: 'Found it.' });
  });

  it('keeps the summary that follows an artifact out of the bubble before it', () => {
    const entries = reduceUnderStrictMode([
      { type: 'tool', toolName: 'create_diagram', status: 'running', args: {} },
      {
        type: 'artifact',
        artifactId: 'art-1',
        source: 'create_diagram',
        artifact: { type: 'diagram', nodes: [], edges: [] },
      },
      { type: 'tool-result', toolName: 'create_diagram', ok: true, summary: 'Diagram: 7 nodes' },
      delta("Here's how they fit together."),
    ]);

    expect(entries.map((e) => e.kind)).toEqual(['tool', 'artifact', 'assistant']);
    expect(entries[2]).toMatchObject({ text: "Here's how they fit together." });
  });

  it('resolves a running tool entry in place rather than appending a second one', () => {
    const entries = reduceUnderStrictMode([
      { type: 'tool', toolName: 'sticky_ideation', status: 'running', args: {} },
      { type: 'tool-result', toolName: 'sticky_ideation', ok: true, summary: '5 sticky notes' },
    ]);
    expect(entries).toEqual([
      {
        kind: 'tool',
        id: 'e1',
        toolName: 'sticky_ideation',
        status: 'done',
        summary: '5 sticky notes',
      },
    ]);
  });

  it('shows an error frame and lets the next turn start clean', () => {
    const entries = reduceUnderStrictMode([
      { type: 'error', message: 'The model ran out of tokens.' },
      { type: 'done', reason: 'error' },
    ]);
    expect(entries).toEqual([{ kind: 'error', id: 'e1', message: 'The model ran out of tokens.' }]);
  });

  it('does not reopen a finished bubble on the next turn', () => {
    const entries = reduceUnderStrictMode([
      delta('First answer.'),
      { type: 'done', reason: 'complete' },
      delta('Second answer.'),
    ]);
    expect(entries.map((e) => (e.kind === 'assistant' ? e.text : e.kind))).toEqual([
      'First answer.',
      'Second answer.',
    ]);
  });
});

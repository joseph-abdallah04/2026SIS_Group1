import type { AssistantStreamEvent } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import {
  applyEvent,
  reconcileProposed,
  transcriptToHistory,
  type ChatEntry,
  type ProposeState,
} from './useAssistantChat';

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

  it('does not append a second running chip for the same in-flight tool', () => {
    const entries = reduceUnderStrictMode([
      { type: 'tool', toolName: 'create_diagram', status: 'running', args: {} },
      { type: 'tool', toolName: 'create_diagram', status: 'running', args: { nodes: [] } },
    ]);
    expect(entries.filter((entry) => entry.kind === 'tool')).toHaveLength(1);
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

  it('does not write a Thinking frame into the transcript', () => {
    const entries = reduceUnderStrictMode([{ type: 'status', phase: 'thinking' }, delta('Hi.')]);
    expect(entries).toEqual([{ kind: 'assistant', id: 'e2', text: 'Hi.', streaming: true }]);
  });

  it('marks a stopped reply so the next turn can tell the model', () => {
    const entries = reduceUnderStrictMode([
      delta('Half of an answ'),
      { type: 'done', reason: 'aborted' },
    ]);
    expect(entries).toEqual([
      { kind: 'assistant', id: 'e1', text: 'Half of an answ', streaming: false, interrupted: true },
    ]);
    expect(transcriptToHistory(entries)[0]).toEqual({
      role: 'assistant',
      content: 'Half of an answ',
      interrupted: true,
    });
  });

  it('fails a running tool when the user stops the turn', () => {
    const entries = reduceUnderStrictMode([
      { type: 'tool', toolName: 'web_search', status: 'running', args: {} },
      { type: 'done', reason: 'aborted' },
    ]);
    expect(entries.find((e) => e.kind === 'tool')).toMatchObject({
      status: 'failed',
      summary: 'Stopped',
    });
    expect(transcriptToHistory(entries).some((m) => m.interrupted === true)).toBe(true);
  });

  it('keeps a stop that produced no text so the next turn still sees it', () => {
    const entries = reduceUnderStrictMode([{ type: 'done', reason: 'aborted' }]);
    expect(transcriptToHistory(entries).at(-1)).toEqual({
      role: 'assistant',
      content: '',
      interrupted: true,
    });
  });
});

describe('transcriptToHistory', () => {
  const turn = (): ChatEntry[] => [
    { kind: 'user', id: 'u1', text: 'five notes please' },
    { kind: 'tool', id: 't1', toolName: 'sticky_ideation', status: 'done' },
    {
      kind: 'artifact',
      id: 'a1',
      source: 'sticky_ideation',
      artifact: { type: 'sticky', text: 'One', color: 'yellow' },
      propose: 'idle',
    },
    { kind: 'assistant', id: 'm1', text: 'Here you go.', streaming: false },
  ];

  // The note this replaced was prepended to the assistant's own words, and the model
  // copied it back out as visible chat — along with the claim that artifacts existed.
  it('keeps what was said separate from what was made', () => {
    const [, assistantTurn] = transcriptToHistory(turn());
    expect(assistantTurn).toEqual({
      role: 'assistant',
      content: 'Here you go.',
      artifacts: ['sticky'],
    });
  });

  it('records a failed tool so the next turn cannot call it a success', () => {
    const history = transcriptToHistory([
      { kind: 'user', id: 'u1', text: 'draw a login flow' },
      { kind: 'tool', id: 't1', toolName: 'create_diagram', status: 'failed' },
      { kind: 'assistant', id: 'm1', text: 'That did not work.', streaming: false },
    ]);

    expect(history[1]).toMatchObject({ failedTools: ['create_diagram'] });
    expect(history[1]?.artifacts).toBeUndefined();
  });

  it('still reports artifacts from a turn that said nothing', () => {
    const entries = turn().slice(0, -1);
    expect(transcriptToHistory(entries).at(-1)).toEqual({
      role: 'assistant',
      content: '',
      artifacts: ['sticky'],
    });
  });

  it('strips the old note out of a transcript restored from storage', () => {
    const history = transcriptToHistory([
      {
        kind: 'assistant',
        id: 'm1',
        text: '(Created 1 diagram for the user; they are already on screen.) Here it is.',
        streaming: false,
      },
    ]);

    expect(history[0]?.content).toBe('Here it is.');
  });
});

describe('reconcileProposed', () => {
  const card = (
    propose: ProposeState,
    seenOnBoard?: boolean,
  ): Extract<ChatEntry, { kind: 'artifact' }> => ({
    kind: 'artifact',
    id: 'art-1',
    source: 'create_diagram',
    artifact: { type: 'diagram', nodes: [], edges: [] },
    propose,
    ...(seenOnBoard ? { seenOnBoard: true } : {}),
  });

  it('does not unlock Propose before the board item has appeared', () => {
    const entries = [card('proposed')];
    expect(reconcileProposed(entries, [])).toBe(entries);
  });

  it('remembers the item once it lands, then unlocks after a delete', () => {
    const diagram = { type: 'diagram' as const, nodes: [], edges: [] };
    const proposed = card('proposed');
    const seen = reconcileProposed([proposed], [diagram]);
    expect(seen[0]).toMatchObject({ propose: 'proposed', seenOnBoard: true });
    expect(reconcileProposed(seen, [])[0]).toMatchObject({ propose: 'idle', seenOnBoard: false });
  });

  // The board broadcast normally arrives before the create ack, so the card is still
  // 'sending' the only time the item is first seen. Ignoring that left Propose stuck
  // on "On the pinboard" for good once the item was deleted.
  it('unlocks after a delete even though the item landed while Propose was still sending', () => {
    const diagram = { type: 'diagram' as const, nodes: [], edges: [] };
    const seen = reconcileProposed([card('sending')], [diagram]);
    expect(seen[0]).toMatchObject({ propose: 'sending', seenOnBoard: true });

    const acked = seen.map((entry) => ({ ...entry, propose: 'proposed' as const }));
    expect(reconcileProposed(acked, [])[0]).toMatchObject({ propose: 'idle', seenOnBoard: false });
  });

  it('does not unlock a card that is still in flight', () => {
    const entries = [card('sending')];
    expect(reconcileProposed(entries, [])).toBe(entries);
  });

  it('keeps two identical stickies independent when only one is deleted', () => {
    const note = { type: 'sticky' as const, text: 'Use Postgres', color: 'yellow' as const };
    const card = (
      id: string,
      seenOnBoard?: boolean,
    ): Extract<ChatEntry, { kind: 'artifact' }> => ({
      kind: 'artifact',
      id,
      source: 'sticky_ideation',
      artifact: note,
      propose: 'proposed',
      ...(seenOnBoard ? { seenOnBoard: true } : {}),
    });

    const bothSeen = reconcileProposed([card('a'), card('b')], [note, note]);
    expect(bothSeen.every((entry) => entry.kind === 'artifact' && entry.seenOnBoard)).toBe(true);

    const afterDelete = reconcileProposed(bothSeen, [note]);
    const proposed = afterDelete.filter(
      (entry) => entry.kind === 'artifact' && entry.propose === 'proposed',
    );
    const idle = afterDelete.filter(
      (entry) => entry.kind === 'artifact' && entry.propose === 'idle',
    );
    expect(proposed).toHaveLength(1);
    expect(idle).toHaveLength(1);
  });
});

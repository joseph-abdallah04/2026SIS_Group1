import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearChat, loadChat, saveChat, MAX_STORED_BYTES } from './chatStorage';
import type { ChatEntry } from './useAssistantChat';

const SESSION = 's1';

// The artifact member specifically, not the whole union: spreading a `ChatEntry` and
// overriding `propose` would widen to "some entry with a propose field", which no member is.
const sticky = (text: string): Extract<ChatEntry, { kind: 'artifact' }> => ({
  kind: 'artifact',
  id: `art-${text}`,
  source: 'sticky_ideation',
  artifact: { type: 'sticky', text, color: 'yellow' },
  propose: 'idle',
});

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('chat persistence', () => {
  it('round-trips a transcript', () => {
    const entries: ChatEntry[] = [
      { kind: 'user', id: 'u1', text: 'What have we proposed?' },
      { kind: 'assistant', id: 'a1', text: 'Two so far.', streaming: false },
    ];
    saveChat(SESSION, entries);
    expect(loadChat(SESSION)).toEqual(entries);
  });

  it('keeps each session separate', () => {
    saveChat('a', [{ kind: 'user', id: 'u1', text: 'in A' }]);
    saveChat('b', [{ kind: 'user', id: 'u1', text: 'in B' }]);
    expect(loadChat('a')).toEqual([{ kind: 'user', id: 'u1', text: 'in A' }]);
    expect(loadChat('b')).toEqual([{ kind: 'user', id: 'u1', text: 'in B' }]);
  });

  it('returns nothing for a session that has no stored chat', () => {
    expect(loadChat('never-used')).toEqual([]);
  });

  // The point of the whole module: a refresh kills the request behind every in-flight state,
  // so restoring one as-is stores a spinner that never stops.
  it('settles a reply that was still streaming', () => {
    saveChat(SESSION, [{ kind: 'assistant', id: 'a1', text: 'Half a thou', streaming: true }]);
    expect(loadChat(SESSION)).toEqual([
      { kind: 'assistant', id: 'a1', text: 'Half a thou', streaming: false },
    ]);
  });

  it('fails a tool that was still running, and says why', () => {
    saveChat(SESSION, [
      { kind: 'tool', id: 't1', toolName: 'web_search', status: 'running' },
    ]);
    expect(loadChat(SESSION)).toEqual([
      {
        kind: 'tool',
        id: 't1',
        toolName: 'web_search',
        status: 'failed',
        summary: 'Interrupted by a page refresh',
      },
    ]);
  });

  it('resets a Propose that was mid-flight, but keeps one that finished', () => {
    saveChat(SESSION, [
      { ...sticky('sending'), propose: 'sending' },
      { ...sticky('done'), propose: 'proposed' },
    ]);
    const restored = loadChat(SESSION);
    expect(restored.map((e) => (e.kind === 'artifact' ? e.propose : e.kind))).toEqual([
      'idle',
      'proposed',
    ]);
  });

  it('keeps completed tool results, including their search links', () => {
    const results = [{ title: 'Socket.IO', url: 'https://socket.io', snippet: 'v4' }];
    saveChat(SESSION, [
      { kind: 'tool', id: 't1', toolName: 'web_search', status: 'done', summary: '1 result', results },
    ]);
    expect(loadChat(SESSION)[0]).toMatchObject({ status: 'done', results });
  });

  it('drops entries this build cannot render rather than showing a broken card', () => {
    sessionStorage.setItem(
      `rt_assistant_chat:${SESSION}`,
      JSON.stringify([
        { kind: 'user', id: 'u1', text: 'kept' },
        { kind: 'hologram', id: 'x1' },
        { kind: 'artifact', id: 'a1', source: 'create_diagram', artifact: { type: 'diagram' } },
        { kind: 'user', id: 'u2' },
        { kind: 'assistant', text: 'no id', streaming: false },
      ]),
    );
    expect(loadChat(SESSION)).toEqual([{ kind: 'user', id: 'u1', text: 'kept' }]);
  });

  it('survives corrupt storage', () => {
    sessionStorage.setItem(`rt_assistant_chat:${SESSION}`, '{ not json');
    expect(loadChat(SESSION)).toEqual([]);
    sessionStorage.setItem(`rt_assistant_chat:${SESSION}`, '"a string"');
    expect(loadChat(SESSION)).toEqual([]);
  });

  it('never throws when storage itself is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(loadChat(SESSION)).toEqual([]);
    expect(() => saveChat(SESSION, [{ kind: 'user', id: 'u1', text: 'hi' }])).not.toThrow();
  });

  it('drops the oldest turns rather than the whole transcript when it outgrows the budget', () => {
    const long = 'x'.repeat(4000);
    const entries: ChatEntry[] = Array.from({ length: 120 }, (_, i) => ({
      kind: 'user',
      id: `u${i}`,
      text: `${i}:${long}`,
    }));
    saveChat(SESSION, entries);

    const restored = loadChat(SESSION);
    expect(restored.length).toBeGreaterThan(0);
    expect(restored.length).toBeLessThan(entries.length);
    expect(JSON.stringify(restored).length).toBeLessThanOrEqual(MAX_STORED_BYTES);
    // The tail is what you come back to, so that is what survives.
    expect(restored.at(-1)).toEqual(entries.at(-1));
  });

  it('clears on request, and saving an empty transcript clears too', () => {
    saveChat(SESSION, [{ kind: 'user', id: 'u1', text: 'hi' }]);
    clearChat(SESSION);
    expect(loadChat(SESSION)).toEqual([]);

    saveChat(SESSION, [{ kind: 'user', id: 'u1', text: 'hi' }]);
    saveChat(SESSION, []);
    expect(sessionStorage.getItem(`rt_assistant_chat:${SESSION}`)).toBeNull();
  });
});

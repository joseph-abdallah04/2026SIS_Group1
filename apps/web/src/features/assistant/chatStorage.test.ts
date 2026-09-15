import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  chatStorageKey,
  clearAllChats,
  clearChat,
  loadChat,
  saveChat,
  MAX_STORED_BYTES,
} from './chatStorage';
import type { ChatEntry } from './useAssistantChat';

const SESSION = 's1';
const USER = 'alice';
const OTHER = 'bob';

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
    saveChat(USER, SESSION, entries);
    expect(loadChat(USER, SESSION)).toEqual(entries);
  });

  it('keeps each session separate', () => {
    saveChat(USER, 'a', [{ kind: 'user', id: 'u1', text: 'in A' }]);
    saveChat(USER, 'b', [{ kind: 'user', id: 'u1', text: 'in B' }]);
    expect(loadChat(USER, 'a')).toEqual([{ kind: 'user', id: 'u1', text: 'in A' }]);
    expect(loadChat(USER, 'b')).toEqual([{ kind: 'user', id: 'u1', text: 'in B' }]);
  });

  it('keeps two people in the same session separate', () => {
    saveChat(USER, SESSION, [{ kind: 'user', id: 'u1', text: "Alice's note" }]);
    saveChat(OTHER, SESSION, [{ kind: 'user', id: 'u1', text: "Bob's note" }]);
    expect(loadChat(USER, SESSION)[0]).toMatchObject({ text: "Alice's note" });
    expect(loadChat(OTHER, SESSION)[0]).toMatchObject({ text: "Bob's note" });
  });

  it('returns nothing for a session that has no stored chat', () => {
    expect(loadChat(USER, 'never-used')).toEqual([]);
  });

  it('returns nothing and writes nothing when there is no user', () => {
    saveChat(null, SESSION, [{ kind: 'user', id: 'u1', text: 'hi' }]);
    expect(loadChat(null, SESSION)).toEqual([]);
    expect(sessionStorage.length).toBe(0);
  });

  it('drops an unscoped legacy key rather than showing it to whoever is logged in', () => {
    sessionStorage.setItem(
      `rt_assistant_chat:${SESSION}`,
      JSON.stringify([{ kind: 'user', id: 'u1', text: 'leaked' }]),
    );
    expect(loadChat(USER, SESSION)).toEqual([]);
    expect(sessionStorage.getItem(`rt_assistant_chat:${SESSION}`)).toBeNull();
  });

  it('settles a reply that was still streaming', () => {
    saveChat(USER, SESSION, [{ kind: 'assistant', id: 'a1', text: 'Half a thou', streaming: true }]);
    expect(loadChat(USER, SESSION)).toEqual([
      { kind: 'assistant', id: 'a1', text: 'Half a thou', streaming: false },
    ]);
  });

  it('fails a tool that was still running, and says why', () => {
    saveChat(USER, SESSION, [{ kind: 'tool', id: 't1', toolName: 'web_search', status: 'running' }]);
    expect(loadChat(USER, SESSION)).toEqual([
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
    saveChat(USER, SESSION, [
      { ...sticky('sending'), propose: 'sending' },
      { ...sticky('done'), propose: 'proposed' },
    ]);
    const restored = loadChat(USER, SESSION);
    expect(restored.map((e) => (e.kind === 'artifact' ? e.propose : e.kind))).toEqual([
      'idle',
      'proposed',
    ]);
  });

  it('keeps completed tool results, including their search links', () => {
    const results = [{ title: 'Socket.IO', url: 'https://socket.io', snippet: 'v4' }];
    saveChat(USER, SESSION, [
      {
        kind: 'tool',
        id: 't1',
        toolName: 'web_search',
        status: 'done',
        summary: '1 result',
        results,
      },
    ]);
    expect(loadChat(USER, SESSION)[0]).toMatchObject({ status: 'done', results });
  });

  it('drops entries this build cannot render rather than showing a broken card', () => {
    sessionStorage.setItem(
      chatStorageKey(USER, SESSION),
      JSON.stringify([
        { kind: 'user', id: 'u1', text: 'kept' },
        { kind: 'hologram', id: 'x1' },
        { kind: 'artifact', id: 'a1', source: 'create_diagram', artifact: { type: 'diagram' } },
        { kind: 'user', id: 'u2' },
        { kind: 'assistant', text: 'no id', streaming: false },
      ]),
    );
    expect(loadChat(USER, SESSION)).toEqual([{ kind: 'user', id: 'u1', text: 'kept' }]);
  });

  it('survives corrupt storage', () => {
    sessionStorage.setItem(chatStorageKey(USER, SESSION), '{ not json');
    expect(loadChat(USER, SESSION)).toEqual([]);
    sessionStorage.setItem(chatStorageKey(USER, SESSION), '"a string"');
    expect(loadChat(USER, SESSION)).toEqual([]);
  });

  it('never throws when storage itself is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(loadChat(USER, SESSION)).toEqual([]);
    expect(() => saveChat(USER, SESSION, [{ kind: 'user', id: 'u1', text: 'hi' }])).not.toThrow();
  });

  it('drops the oldest turns rather than the whole transcript when it outgrows the budget', () => {
    const long = 'x'.repeat(4000);
    const entries: ChatEntry[] = Array.from({ length: 120 }, (_, i) => ({
      kind: 'user',
      id: `u${i}`,
      text: `${i}:${long}`,
    }));
    saveChat(USER, SESSION, entries);

    const restored = loadChat(USER, SESSION);
    expect(restored.length).toBeGreaterThan(0);
    expect(restored.length).toBeLessThan(entries.length);
    expect(JSON.stringify(restored).length).toBeLessThanOrEqual(MAX_STORED_BYTES);
    expect(restored.at(-1)).toEqual(entries.at(-1));
  });

  it('clears on request, and saving an empty transcript clears too', () => {
    saveChat(USER, SESSION, [{ kind: 'user', id: 'u1', text: 'hi' }]);
    clearChat(USER, SESSION);
    expect(loadChat(USER, SESSION)).toEqual([]);

    saveChat(USER, SESSION, [{ kind: 'user', id: 'u1', text: 'hi' }]);
    saveChat(USER, SESSION, []);
    expect(sessionStorage.getItem(chatStorageKey(USER, SESSION))).toBeNull();
  });

  it('wipes every assistant key in the tab', () => {
    saveChat(USER, SESSION, [{ kind: 'user', id: 'u1', text: 'alice' }]);
    saveChat(OTHER, 's2', [{ kind: 'user', id: 'u1', text: 'bob' }]);
    sessionStorage.setItem('unrelated', 'keep');
    clearAllChats();
    expect(loadChat(USER, SESSION)).toEqual([]);
    expect(loadChat(OTHER, 's2')).toEqual([]);
    expect(sessionStorage.getItem('unrelated')).toBe('keep');
  });
});

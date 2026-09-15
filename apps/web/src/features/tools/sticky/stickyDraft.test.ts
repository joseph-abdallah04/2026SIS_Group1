import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STICKY_MAX_LINES, STICKY_TEXT_LIMIT } from '../artifactLimits';
import {
  clearStickyDraft,
  draftKeyFor,
  readStickyDraft,
  sourceDraftKeyFor,
  writeStickyDraft,
} from './stickyDraft';

const KEY = draftKeyFor('session-1', 'question-1', 'user-1');

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sticky draft', () => {
  it('gives back what was saved, colour included', () => {
    writeStickyDraft(KEY, {
      text: 'Ship the beta',
      color: 'pink',
      marks: [],
      lines: [null],
      levels: [0],
      links: [],
    });

    expect(readStickyDraft(KEY)).toEqual({
      text: 'Ship the beta',
      color: 'pink',
      marks: [],
      lines: [null],
      levels: [0],
      links: [],
    });
  });

  it('has nothing to give back before anything is written', () => {
    expect(readStickyDraft(KEY)).toBeNull();
  });

  // Emptying the popup is how a draft is thrown away.
  it('forgets a draft that has been emptied', () => {
    writeStickyDraft(KEY, {
      text: 'Ship the beta',
      color: 'pink',
      marks: [],
      lines: [null],
      levels: [0],
      links: [],
    });
    writeStickyDraft(KEY, {
      text: '   ',
      color: 'pink',
      marks: [],
      lines: [null],
      levels: [0],
      links: [],
    });

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('forgets a draft once it is cleared', () => {
    writeStickyDraft(KEY, {
      text: 'Ship the beta',
      color: 'pink',
      marks: [],
      lines: [null],
      levels: [0],
      links: [],
    });
    clearStickyDraft(KEY);

    expect(readStickyDraft(KEY)).toBeNull();
  });

  // Somebody else signing in on the same machine, the same person in another
  // session, or the same session moving on to its next question, must not open
  // the popup on this note.
  it('keeps each person, in each session, on each question, to their own draft', () => {
    writeStickyDraft(KEY, {
      text: 'Mine',
      color: 'yellow',
      marks: [],
      lines: [null],
      levels: [0],
      links: [],
    });

    expect(readStickyDraft(draftKeyFor('session-1', 'question-1', 'user-2'))).toBeNull();
    expect(readStickyDraft(draftKeyFor('session-2', 'question-1', 'user-1'))).toBeNull();
    expect(readStickyDraft(draftKeyFor('session-1', 'question-2', 'user-1'))).toBeNull();
  });

  it('keeps an edit or an extension of each sticky apart from every other draft', () => {
    const edit = sourceDraftKeyFor(KEY, 'edit', 'proposal-1');
    const note = { marks: [], lines: [null], levels: [0], links: [] };
    writeStickyDraft(KEY, { ...note, text: 'New', color: 'yellow' });
    writeStickyDraft(edit, { ...note, text: 'Edited', color: 'pink' });

    expect(readStickyDraft(KEY)?.text).toBe('New');
    expect(readStickyDraft(edit)?.text).toBe('Edited');
    expect(readStickyDraft(sourceDraftKeyFor(KEY, 'edit', 'proposal-2'))).toBeNull();
    expect(readStickyDraft(sourceDraftKeyFor(KEY, 'extend', 'proposal-1'))).toBeNull();
  });

  // Saved before drafts were per question, so there is no telling which
  // question they belong to, and no question can show them.
  it('never reads a draft saved before the question was part of the key', () => {
    localStorage.setItem(
      'rt_sticky_draft:session-1:user-1',
      JSON.stringify({ text: 'Which question was this?', color: 'yellow' }),
    );

    expect(readStickyDraft(KEY)).toBeNull();
    expect(readStickyDraft(draftKeyFor('session-1', 'question-2', 'user-1'))).toBeNull();
  });

  // Stored data outlives the code that wrote it.
  it('ignores what is stored when it is not a draft', () => {
    localStorage.setItem(KEY, 'not json');
    expect(readStickyDraft(KEY)).toBeNull();

    localStorage.setItem(KEY, JSON.stringify({ text: 'Hi', color: 'purple' }));
    expect(readStickyDraft(KEY)).toBeNull();

    localStorage.setItem(KEY, JSON.stringify({ text: 42, color: 'yellow' }));
    expect(readStickyDraft(KEY)).toBeNull();
  });

  // Enter held down before line breaks were counted saved hundreds of them,
  // and the popup opened tall enough to reach off the top of the window.
  // Whitespace may be deliberate, so a draft is not tidied on its way back.
  it('comes back exactly as it was written, whitespace included', () => {
    const text = `  Idea\n\n    indented  \n`;
    localStorage.setItem(KEY, JSON.stringify({ text, color: 'pink' }));

    expect(readStickyDraft(KEY)).toEqual({
      text,
      color: 'pink',
      marks: [],
      // Three line breaks, so four lines, the last of them empty.
      lines: [null, null, null, null],
      levels: [0, 0, 0, 0],
      links: [],
    });
  });

  it('has nothing to give back when the draft was only empty lines', () => {
    localStorage.setItem(KEY, JSON.stringify({ text: '\n'.repeat(100), color: 'pink' }));

    expect(readStickyDraft(KEY)).toBeNull();
  });

  it('cuts a draft saved under a longer limit to the current one', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ text: 'a'.repeat(STICKY_TEXT_LIMIT + 200), color: 'blue' }),
    );

    expect(readStickyDraft(KEY)?.text).toHaveLength(STICKY_TEXT_LIMIT);
  });

  it('cuts a draft saved with more lines than a sticky may have', () => {
    const text = Array.from({ length: STICKY_MAX_LINES + 30 }, (_, index) => `${index}`).join('\n');
    localStorage.setItem(KEY, JSON.stringify({ text, color: 'blue' }));

    const draft = readStickyDraft(KEY);
    expect(draft?.text.split('\n')).toHaveLength(STICKY_MAX_LINES);
    expect(draft?.text.startsWith('0\n1\n')).toBe(true);
  });

  it('gives back its formatting with its words', () => {
    const marks = [
      { from: 0, to: 4, style: 'bold' as const },
      { from: 5, to: 8, style: 'italic' as const },
    ];
    writeStickyDraft(KEY, {
      text: 'Ship the beta\nNotes',
      color: 'pink',
      marks,
      lines: ['bullet', 'bullet'],
      levels: [0, 1],
      links: [{ from: 9, to: 13, href: 'https://example.com/beta' }],
    });

    expect(readStickyDraft(KEY)).toEqual({
      text: 'Ship the beta\nNotes',
      color: 'pink',
      marks,
      lines: ['bullet', 'bullet'],
      levels: [0, 1],
      links: [{ from: 9, to: 13, href: 'https://example.com/beta' }],
    });
  });

  // A draft is only as trustworthy as whatever else can write to storage.
  it('never gives back a link that would open anything but a website', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        text: 'Press here',
        color: 'yellow',
        links: [
          { from: 0, to: 5, href: 'javascript:alert(1)' },
          { from: 6, to: 10, href: 'https://example.com/' },
        ],
      }),
    );

    expect(readStickyDraft(KEY)?.links).toEqual([
      { from: 6, to: 10, href: 'https://example.com/' },
    ]);
  });

  // Saved before formatting existed, or tampered with: whatever is not a range
  // on these words is dropped, and the words still come back.
  it('keeps only formatting that fits the words it was saved with', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        text: 'Hello',
        color: 'yellow',
        marks: [
          { from: 0, to: 2, style: 'bold' },
          { from: 3, to: 40, style: 'italic' },
          { from: 0, to: 2, style: 'shouting' },
          'bold',
        ],
      }),
    );

    expect(readStickyDraft(KEY)).toEqual({
      text: 'Hello',
      color: 'yellow',
      marks: [
        { from: 0, to: 2, style: 'bold' },
        { from: 3, to: 5, style: 'italic' },
      ],
      lines: [null],
      levels: [0],
      links: [],
    });
  });

  // Private modes and blocked site data throw on any access at all.
  it('carries on without a draft when storage cannot be reached', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readStickyDraft(KEY)).toBeNull();
    expect(() =>
      writeStickyDraft(KEY, {
        text: 'Hi',
        color: 'yellow',
        marks: [],
        lines: [null],
        levels: [0],
        links: [],
      }),
    ).not.toThrow();
    expect(() => clearStickyDraft(KEY)).not.toThrow();
  });
});

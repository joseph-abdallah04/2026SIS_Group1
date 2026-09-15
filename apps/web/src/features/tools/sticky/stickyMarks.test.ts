import { describe, expect, it } from 'vitest';

import {
  autoLinkBefore,
  canIndent,
  canOutdent,
  formatForArtifact,
  hasStyleThroughout,
  indentLines,
  linkAround,
  linkRuns,
  listLabel,
  listThroughout,
  noteFromSegments,
  normalizeLinks,
  normalizeMarks,
  replaceText,
  sameNote,
  segmentStyle,
  setLink,
  stickyPlainText,
  stickyBlocks,
  stickySegments,
  stylesForCaret,
  stylesThroughout,
  toggleList,
  toggleStyle,
  toStickyNote,
} from './stickyMarks';

describe('normalizeMarks', () => {
  it('merges ranges of one style that touch or overlap, and keeps styles apart', () => {
    expect(
      normalizeMarks(20, [
        { from: 6, to: 10, style: 'bold' },
        { from: 0, to: 4, style: 'bold' },
        { from: 4, to: 6, style: 'bold' },
        { from: 2, to: 8, style: 'italic' },
      ]),
    ).toEqual([
      { from: 0, to: 10, style: 'bold' },
      { from: 2, to: 8, style: 'italic' },
    ]);
  });

  // Whatever a stored note or a crafted payload says, a range never points past
  // the words it was set on.
  it('clamps ranges to the text and drops what covers nothing', () => {
    expect(
      normalizeMarks(5, [
        { from: -3, to: 2, style: 'bold' },
        { from: 3, to: 99, style: 'italic' },
        { from: 4, to: 4, style: 'underline' },
        { from: 9, to: 12, style: 'strike' },
      ]),
    ).toEqual([
      { from: 0, to: 2, style: 'bold' },
      { from: 3, to: 5, style: 'italic' },
    ]);
  });
});

describe('toggleStyle', () => {
  const note = toStickyNote({ text: 'Ship the beta' });

  it('puts a style on a selection, and takes it off when it is all in it already', () => {
    const bold = toggleStyle(note, 0, 4, 'bold');
    expect(bold.marks).toEqual([{ from: 0, to: 4, style: 'bold' }]);

    expect(toggleStyle(bold, 0, 4, 'bold').marks).toEqual([]);
  });

  it('makes a partly styled selection all one style first', () => {
    const partly = toggleStyle(note, 0, 4, 'bold');
    expect(toggleStyle(partly, 2, 8, 'bold').marks).toEqual([{ from: 0, to: 8, style: 'bold' }]);
  });

  it('takes a style off the middle of a range, leaving both ends', () => {
    const bold = toggleStyle(note, 0, 13, 'bold');
    expect(toggleStyle(bold, 5, 8, 'bold').marks).toEqual([
      { from: 0, to: 5, style: 'bold' },
      { from: 8, to: 13, style: 'bold' },
    ]);
  });
});

describe('replaceText', () => {
  const note = toStickyNote({
    text: 'Ship the beta',
    marks: [
      { from: 0, to: 4, style: 'bold' as const },
      { from: 9, to: 13, style: 'italic' as const },
    ],
  });

  it('moves formatting after a change along with its words', () => {
    const next = replaceText(note, 5, 8, 'our', []);
    expect(next.text).toBe('Ship our beta');
    expect(next.marks).toEqual([
      { from: 0, to: 4, style: 'bold' },
      { from: 9, to: 13, style: 'italic' },
    ]);
  });

  it('sets typed words in the styles asked for, and only those', () => {
    const next = replaceText(note, 4, 4, '!!', ['bold']);
    expect(next.text).toBe('Ship!! the beta');
    expect(next.marks).toEqual([
      { from: 0, to: 6, style: 'bold' },
      { from: 11, to: 15, style: 'italic' },
    ]);
  });

  it('cuts formatting short where words are deleted through it', () => {
    const next = replaceText(note, 2, 11, '', []);
    expect(next.text).toBe('Shta');
    expect(next.marks).toEqual([
      { from: 0, to: 2, style: 'bold' },
      { from: 2, to: 4, style: 'italic' },
    ]);
  });
});

describe('carets and selections', () => {
  const marks = normalizeMarks(10, [
    { from: 0, to: 5, style: 'bold' },
    { from: 3, to: 8, style: 'italic' },
  ]);

  it('types in the styles of the character before the caret', () => {
    expect(stylesForCaret(marks, 5)).toEqual(['bold', 'italic']);
    expect(stylesForCaret(marks, 6)).toEqual(['italic']);
    expect(stylesForCaret(marks, 0)).toEqual(['bold']);
  });

  it('says which styles a whole selection shares', () => {
    expect(stylesThroughout(marks, 3, 5)).toEqual(['bold', 'italic']);
    expect(stylesThroughout(marks, 0, 8)).toEqual([]);
    expect(hasStyleThroughout(marks, 0, 5, 'bold')).toBe(true);
    expect(hasStyleThroughout(marks, 0, 6, 'bold')).toBe(false);
  });
});

describe('segments', () => {
  it('breaks a note into runs set all one way, and back again', () => {
    const note = toStickyNote({
      text: 'Ship the beta',
      marks: [
        { from: 0, to: 4, style: 'bold' },
        { from: 2, to: 8, style: 'italic' },
      ],
    });
    const segments = stickySegments(note.text, note.marks);
    expect(segments).toEqual([
      { text: 'Sh', styles: ['bold'] },
      { text: 'ip', styles: ['bold', 'italic'] },
      { text: ' the', styles: ['italic'] },
      { text: ' beta', styles: [] },
    ]);
    expect(sameNote(noteFromSegments(segments), note)).toBe(true);
  });

  it('is one plain run for a note with no formatting', () => {
    expect(stickySegments('Hello')).toEqual([{ text: 'Hello', styles: [] }]);
    expect(stickySegments('')).toEqual([]);
  });
});

describe('storing and drawing formatting', () => {
  it('leaves marks off a note with none, so it is stored as notes always were', () => {
    expect(formatForArtifact(toStickyNote({ text: 'Hello' }))).toEqual({});
    expect(
      formatForArtifact(
        toStickyNote({ text: 'Hello', marks: [{ from: 0, to: 2, style: 'bold' }] }),
      ),
    ).toEqual({
      marks: [{ from: 0, to: 2, style: 'bold' }],
    });
  });

  it('draws underline and strikethrough together rather than one over the other', () => {
    expect(segmentStyle(['bold', 'italic', 'underline', 'strike'])).toEqual({
      fontWeight: 700,
      fontStyle: 'italic',
      textDecorationLine: 'underline line-through',
    });
    expect(segmentStyle([])).toEqual({});
  });
});

describe('lists', () => {
  it('carries a list on to the lines started inside it', () => {
    const note = toStickyNote({ text: 'Milk', lines: ['bullet'] });
    const next = replaceText(note, 4, 4, '\nEggs\nBread', []);

    expect(next.lines).toEqual(['bullet', 'bullet', 'bullet']);
  });

  // Joined lines take the style of the first, the way a word processor does.
  it('gives lines joined together the style of the first of them', () => {
    const note = toStickyNote({ text: 'Intro\nMilk\nEggs', lines: [null, 'bullet', 'number'] });
    const joined = replaceText(note, 5, 6, '', []);

    expect(joined.text).toBe('IntroMilk\nEggs');
    expect(joined.lines).toEqual([null, 'number']);
  });

  it('keeps each line on its own style as lines above it are added or taken away', () => {
    const note = toStickyNote({ text: 'A\nB\nC', lines: [null, 'bullet', 'number'] });

    expect(replaceText(note, 0, 0, 'New\n', []).lines).toEqual([null, null, 'bullet', 'number']);
    expect(replaceText(note, 0, 2, '', []).lines).toEqual(['bullet', 'number']);
  });

  it('toggles a list on the lines a selection touches, not the line it ends at the start of', () => {
    const note = toStickyNote({ text: 'One\nTwo\nThree' });
    const listed = toggleList(note, 0, 8, 'bullet');

    expect(listed.lines).toEqual(['bullet', 'bullet', null]);
    expect(listThroughout(listed, 0, 8)).toBe('bullet');
    expect(toggleList(listed, 0, 8, 'bullet').lines).toEqual([null, null, null]);
  });

  it('numbers each numbered list from 1, and starts again after a plain line', () => {
    const blocks = stickyBlocks({
      text: 'a\nb\nc\nd\ne',
      lines: ['number', 'number', null, 'number', 'bullet'],
    });

    expect(blocks.map((block) => block.number)).toEqual([1, 2, null, 1, null]);
    expect(blocks.map((block) => block.segments.map((segment) => segment.text).join())).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('stores list styles only as far as the last line in a list', () => {
    expect(
      formatForArtifact(toStickyNote({ text: 'a\nb\nc', lines: ['bullet', null, null] })),
    ).toEqual({
      lines: ['bullet'],
    });
    expect(formatForArtifact(toStickyNote({ text: 'a\nb', lines: [null, null] }))).toEqual({});
  });

  it('counts two notes with different lists as different', () => {
    expect(
      sameNote(toStickyNote({ text: 'a', lines: ['bullet'] }), toStickyNote({ text: 'a' })),
    ).toBe(false);
  });
});

describe('nested lists', () => {
  const list = (levels: number[] = []) =>
    toStickyNote({ text: 'Plan\nDraft\nReview', lines: ['bullet', 'bullet', 'bullet'], levels });

  it('nests an item under the one above it, and no deeper than one level under it', () => {
    const once = indentLines(list(), 6, 6, 1);
    expect(once.levels).toEqual([0, 1, 0]);
    expect(indentLines(once, 6, 6, 1).levels).toEqual([0, 1, 0]);
    expect(canIndent(once, 6, 6)).toBe(false);
    expect(canIndent(once, 12, 12)).toBe(true);
  });

  // With nothing above it to be nested under, the first item stays put.
  it('leaves the first item of a list where it is', () => {
    expect(canIndent(list(), 0, 0)).toBe(false);
    expect(indentLines(list(), 0, 0, 1).levels).toEqual([0, 0, 0]);
  });

  it('nests a run of selected items together, and brings them back out', () => {
    const nested = indentLines(list(), 5, 17, 1);
    expect(nested.levels).toEqual([0, 1, 1]);
    expect(canOutdent(nested, 5, 17)).toBe(true);
    expect(indentLines(nested, 5, 17, -1).levels).toEqual([0, 0, 0]);
    expect(canOutdent(list(), 0, 17)).toBe(false);
  });

  it('goes no deeper than a sticky allows', () => {
    const text = 'a\nb\nc\nd';
    const note = toStickyNote({ text, lines: ['bullet', 'bullet', 'bullet', 'bullet'] });
    const deepest = indentLines(indentLines(indentLines(note, 2, 7, 1), 4, 7, 1), 6, 7, 1);
    expect(deepest.levels).toEqual([0, 1, 2, 2]);
    expect(toStickyNote({ text: 'a', lines: ['bullet'], levels: [9] }).levels).toEqual([2]);
  });

  it('forgets how deep a line was once it is out of the list', () => {
    const nested = list([0, 1, 1]);
    expect(toggleList(nested, 6, 6, 'bullet').levels).toEqual([0, 0, 1]);
    expect(toStickyNote({ text: 'a\nb', lines: ['bullet'], levels: [0, 1] }).levels).toEqual([
      0, 0,
    ]);
  });

  it('carries the depth on to a new line started in a nested item', () => {
    const next = replaceText(list([0, 1, 0]), 10, 10, '\nEdit', []);
    expect(next.text).toBe('Plan\nDraft\nEdit\nReview');
    expect(next.levels).toEqual([0, 1, 1, 0]);
  });

  it('numbers a nested list on its own, in letters, and carries on the list it is in', () => {
    const blocks = stickyBlocks({
      text: 'a\nb\nc\nd\ne\nf\ng',
      lines: ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
      levels: [0, 1, 1, 2, 0, 1, 0],
    });

    expect(blocks.map((block) => block.label)).toEqual(['1', 'a', 'b', 'i', '2', 'a', '3']);
    expect(blocks.map((block) => block.level)).toEqual([0, 1, 1, 2, 0, 1, 0]);
  });

  it('writes places in letters and numerals past the first few', () => {
    expect([1, 26, 27, 52].map((count) => listLabel(count, 1))).toEqual(['a', 'z', 'aa', 'az']);
    expect([4, 9, 14, 40].map((count) => listLabel(count, 2))).toEqual(['iv', 'ix', 'xiv', 'xl']);
  });

  it('stores nesting only as far as the last nested line', () => {
    expect(formatForArtifact(list([0, 1, 0]))).toEqual({
      lines: ['bullet', 'bullet', 'bullet'],
      levels: [0, 1],
    });
    expect(formatForArtifact(list())).toEqual({ lines: ['bullet', 'bullet', 'bullet'] });
  });
});

describe('links', () => {
  const href = 'https://example.com/spec';
  const note = toStickyNote({ text: 'Read the spec today' });

  it('links the words chosen, and takes the link off them again', () => {
    const linked = setLink(note, 9, 13, href);
    expect(linked.links).toEqual([{ from: 9, to: 13, href }]);
    expect(setLink(linked, 9, 13, null).links).toEqual([]);
  });

  it('cuts an existing link back to the words a new one leaves it', () => {
    const linked = setLink(note, 0, 13, href);
    expect(setLink(linked, 5, 8, 'https://example.org/').links).toEqual([
      { from: 0, to: 5, href },
      { from: 5, to: 8, href: 'https://example.org/' },
      { from: 8, to: 13, href },
    ]);
  });

  it('finds the link a caret is in or at the end of, or a selection lies inside', () => {
    const linked = setLink(note, 9, 13, href);
    expect(linkAround(linked, 11, 11)?.href).toBe(href);
    expect(linkAround(linked, 13, 13)?.href).toBe(href);
    expect(linkAround(linked, 10, 12)?.href).toBe(href);
    expect(linkAround(linked, 4, 11)).toBeNull();
    expect(linkAround(linked, 2, 2)).toBeNull();
  });

  // Typing on after a link carries the sentence on, not the link.
  it('grows with words typed inside it, but not after it', () => {
    const linked = setLink(note, 9, 13, href);
    expect(replaceText(linked, 11, 11, 'e', []).links).toEqual([{ from: 9, to: 14, href }]);
    expect(replaceText(linked, 13, 13, 's', []).links).toEqual([{ from: 9, to: 13, href }]);
    expect(replaceText(linked, 0, 5, '', []).links).toEqual([{ from: 4, to: 8, href }]);
    expect(replaceText(linked, 10, 19, '', []).links).toEqual([{ from: 9, to: 10, href }]);
  });

  // Whatever a stored note or a crafted payload says, nothing but a website is
  // ever drawn as a link.
  it('drops a link that would open anything but a website', () => {
    expect(
      normalizeLinks(10, [
        { from: 0, to: 3, href: 'javascript:alert(1)' },
        { from: 0, to: 3, href: 'data:text/html,hi' },
        { from: 0, to: 3, href: 'example.com' },
        { from: 4, to: 9, href: 'https://example.com/' },
        'https://example.com/',
      ]),
    ).toEqual([{ from: 4, to: 9, href: 'https://example.com/' }]);
  });

  it('merges links to one address that touch, and keeps overlapping ones apart', () => {
    expect(
      normalizeLinks(20, [
        { from: 5, to: 9, href },
        { from: 0, to: 5, href },
        { from: 7, to: 15, href: 'https://example.org/' },
      ]),
    ).toEqual([
      { from: 0, to: 9, href },
      { from: 9, to: 15, href: 'https://example.org/' },
    ]);
  });

  it('breaks a line into the links it holds, formatted runs and all', () => {
    const linked = toggleStyle(setLink(note, 5, 13, href), 9, 13, 'bold');
    const [block] = stickyBlocks(linked);
    expect(linkRuns(block!.segments)).toEqual([
      { href: null, segments: [{ text: 'Read ', styles: [] }] },
      {
        href,
        segments: [
          { text: 'the ', styles: [], href },
          { text: 'spec', styles: ['bold'], href },
        ],
      },
      { href: null, segments: [{ text: ' today', styles: [] }] },
    ]);
    expect(sameNote(noteFromSegments(block!.segments), linked)).toBe(true);
  });

  it('does not underline a linked run twice', () => {
    expect(segmentStyle(['underline', 'strike'], true)).toEqual({
      textDecorationLine: 'line-through',
    });
  });

  describe('an address finished by typing', () => {
    const linkedAt = (text: string, offset = text.length) =>
      autoLinkBefore(toStickyNote({ text }), offset)?.links ?? null;

    it('links an address typed out in full, or starting www.', () => {
      expect(linkedAt('See https://example.com/docs')).toEqual([
        { from: 4, to: 28, href: 'https://example.com/docs' },
      ]);
      expect(linkedAt('www.example.com')).toEqual([
        { from: 0, to: 15, href: 'https://www.example.com/' },
      ]);
    });

    it('links only the word the caret is at the end of', () => {
      expect(linkedAt('https://a.example first second', 17)).toEqual([
        { from: 0, to: 17, href: 'https://a.example/' },
      ]);
      expect(linkedAt('https://a.example first')).toBeNull();
    });

    // The end of the sentence is not part of the address.
    it('leaves the punctuation after an address out of the link', () => {
      expect(linkedAt('Read https://example.com.')).toEqual([
        { from: 5, to: 24, href: 'https://example.com/' },
      ]);
      expect(linkedAt('(see https://example.com)')).toEqual([
        { from: 5, to: 24, href: 'https://example.com/' },
      ]);
      expect(linkedAt('https://en.example.org/wiki/Set_(maths)')?.[0]?.to).toBe(39);
    });

    it('leaves words that only might be an address, or are not one a link may open', () => {
      expect(linkedAt('notes.txt')).toBeNull();
      expect(linkedAt('example.com')).toBeNull();
      expect(linkedAt('javascript:alert(1)')).toBeNull();
      expect(linkedAt('https://')).toBeNull();
    });

    it('leaves an address that is already a link as it is', () => {
      const linked = setLink(toStickyNote({ text: 'https://example.com' }), 0, 19, href);
      expect(autoLinkBefore(linked, 19)).toBeNull();
    });
  });

  it('stores links only when there are some', () => {
    expect(formatForArtifact(note)).toEqual({});
    expect(formatForArtifact(setLink(note, 0, 4, href))).toEqual({
      links: [{ from: 0, to: 4, href }],
    });
  });
});

describe('stickyPlainText', () => {
  it('keeps a note with no lists exactly as written', () => {
    expect(stickyPlainText({ text: 'Ship it\n\nthen celebrate' })).toBe(
      'Ship it\n\nthen celebrate',
    );
  });

  it('writes the bullets and numbers a card draws, which the words alone do not carry', () => {
    const text = ['Plan', 'Build', 'Ship', 'Notes', 'Read spec', 'Ask'].join('\n');
    expect(
      stickyPlainText({
        text,
        lines: ['number', 'number', 'number', null, 'bullet', 'bullet'],
      }),
    ).toBe(['1. Plan', '2. Build', '3. Ship', 'Notes', '• Read spec', '• Ask'].join('\n'));
  });

  // Counted the way the card counts: again from 1 after a plain line, and on
  // its own at each depth, marked 1 / a / i as the depths are.
  it('restarts numbering after a plain line and indents nested items', () => {
    const text = ['One', 'Sub', 'Sub two', 'Two', 'Break', 'Again'].join('\n');
    expect(
      stickyPlainText({
        text,
        lines: ['number', 'number', 'number', 'number', null, 'number'],
        levels: [0, 1, 1, 0, 0, 0],
      }),
    ).toBe(['1. One', '  a. Sub', '  b. Sub two', '2. Two', 'Break', '1. Again'].join('\n'));
  });

  it('keeps the words of a link and leaves its address behind', () => {
    expect(
      stickyPlainText({
        text: 'Read the spec',
        links: [{ from: 9, to: 13, href: 'https://example.com/spec' }],
      }),
    ).toBe('Read the spec');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StickyMark } from '@roundtable/shared';

import { CARD_WIDTH } from '../../pinboard/pinboardTokens';
import { STICKY_TEXT_LIMIT } from '../artifactLimits';
import {
  STICKY_FONT_SIZE,
  STICKY_MAX_SIZE,
  STICKY_MIN_SIZE,
  stickySize,
  stickySquare,
} from './stickyPresentation';

afterEach(() => {
  vi.restoreAllMocks();
});

const SIZES = [217, 238, 258, 278, 299, 319, 339];

describe('sticky sizes', () => {
  // A square a few pixels short of a whole line fits one line fewer than it
  // looks like it should, and the note spills over the byline.
  it('go up a whole line at a time, from eight lines to fourteen', () => {
    expect([8, 9, 10, 11, 12, 13, 14].map(stickySquare)).toEqual(SIZES);
    expect(STICKY_MIN_SIZE).toBe(217);
    expect(STICKY_MAX_SIZE).toBe(339);
  });

  // Anything still reading the token has to get the size a sticky really
  // starts at.
  it('start at the width the card token gives a sticky', () => {
    expect(CARD_WIDTH.sticky).toBe(STICKY_MIN_SIZE);
  });

  it('set every note at one size', () => {
    expect(STICKY_FONT_SIZE).toBe(14);
  });
});

describe('stickySize without a layout engine', () => {
  // jsdom lays nothing out, so this is the estimate the board never uses.
  it('keeps a one-liner on the smallest square', () => {
    expect(stickySize({ text: 'Ledger owns balances' })).toBe(217);
  });

  it('grows a note steadily rather than in a few big steps', () => {
    const sizes = [100, 200, 260, 320, 380, 440, 500].map((length) =>
      stickySize({ text: 'a'.repeat(length) }),
    );
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(sizes).size).toBeGreaterThan(3);
  });

  it('holds a note at the limit in ordinary prose', () => {
    const text = 'a'.repeat(STICKY_TEXT_LIMIT);
    expect(STICKY_TEXT_LIMIT).toBe(500);
    expect(stickySize({ text })).toBeLessThanOrEqual(STICKY_MAX_SIZE);
  });

  // Line breaks take lines whatever the count says.
  it('counts line breaks, and goes no wider than the largest sticky for them', () => {
    expect(stickySize({ text: `${'\n'.repeat(20)}x` })).toBe(STICKY_MAX_SIZE);
    expect(stickySize({ text: 'Short' })).toBe(STICKY_MIN_SIZE);
  });
});

describe('stickySize with a layout engine', () => {
  /**
   * A stand-in layout: every character is `advance` wide, bold ones a fifth
   * wider, and a card is its chrome plus however many lines the note wraps to at
   * the probe's width. Enough to show the size comes from how the note is laid
   * out, formatting and all, rather than from how many characters it has.
   */
  function layOut(advance: number) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const width = parseFloat(this.style.width);
      const note = this.querySelector('[data-sticky-note]');
      // Each line of the note wraps on its own; a list item has less room.
      const lines = Array.from(note?.querySelectorAll('.rt-sticky-line') ?? []).reduce(
        (sum, line) => {
          const text = line.textContent ?? '';
          const bold = Array.from(line.querySelectorAll('[data-sticky-styles~="bold"]')).reduce(
            (count, span) => count + (span.textContent?.length ?? 0),
            0,
          );
          const inkWidth = (text.length - bold) * advance + bold * advance * 1.2;
          const level = Number(line.getAttribute('data-level') ?? 0);
          const room = width - 28 - (line.hasAttribute('data-list') ? 21 + level * 17.5 : 0);
          return sum + Math.max(1, Math.ceil(inkWidth / room));
        },
        0,
      );
      return { height: 54.5 + Math.max(1, lines) * 20.3 } as DOMRect;
    });
  }

  it('keeps a note on the smallest square that holds it', () => {
    layOut(10);

    expect(stickySize({ text: 'a'.repeat(100) })).toBe(217);
  });

  it('never makes a card taller than it is wide while the note fits', () => {
    layOut(7);
    for (const length of [50, 150, 250, 350, 450, STICKY_TEXT_LIMIT]) {
      const text = 'a'.repeat(length);
      const size = stickySize({ text });
      const height = 54.5 + Math.ceil((length * 7) / (size - 28)) * 20.3;

      expect(height).toBeLessThanOrEqual(size);
    }
  });

  // Bold is wider than the note's usual weight. A size worked out from the
  // plain words would leave a bold note a line short.
  it('sizes a formatted note by how wide its formatting really is', () => {
    layOut(8);
    const text = 'a'.repeat(250);
    const allBold: StickyMark[] = [{ from: 0, to: text.length, style: 'bold' }];

    expect(stickySize({ text, marks: allBold })).toBeGreaterThan(stickySize({ text }));
  });

  // A list item is indented, so the same words can take a line more as a list.
  it('sizes a list by the room its items really have', () => {
    layOut(8);
    const text = 'a'.repeat(200);

    expect(stickySize({ text, lines: ['bullet'] })).toBeGreaterThanOrEqual(stickySize({ text }));
    expect(stickySize({ text, lines: ['bullet'] })).not.toBe(stickySize({ text: 'b'.repeat(40) }));
  });

  // Each level in is less room again, so the size has to know how deep an item is.
  it('sizes a nested list by the room its nested items really have', () => {
    layOut(8);
    const text = `${'a'.repeat(10)}\n${'a'.repeat(390)}`;
    const flat = stickySize({ text, lines: ['bullet', 'bullet'] });
    const nested = stickySize({ text, lines: ['bullet', 'bullet'], levels: [0, 1] });

    expect(nested).toBeGreaterThan(flat);
  });

  // Taller, not wider: the card grows down for the rest of it.
  it('keeps a note longer than even the largest sticky holds at the largest width', () => {
    layOut(10);
    const text = 'a'.repeat(STICKY_TEXT_LIMIT);

    expect(stickySize({ text })).toBe(STICKY_MAX_SIZE);
  });

  // Left holding the last note, the probe is a hidden second copy of somebody's
  // words in the page.
  it('leaves nothing of the note behind in the page after measuring', () => {
    layOut(7);
    stickySize({ text: 'A private thought', marks: [{ from: 0, to: 9, style: 'italic' }] });

    expect(document.body.textContent).not.toContain('private thought');
  });
});

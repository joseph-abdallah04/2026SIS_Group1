import { afterEach, describe, expect, it, vi } from 'vitest';

import { STICKY_TEXT_LIMIT } from '../artifactLimits';
import {
  STICKY_FONT_SIZE,
  STICKY_MAX_SIZE,
  STICKY_MIN_SIZE,
  stickyFits,
  stickySize,
  stickySquare,
} from './stickyPresentation';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sticky sizes', () => {
  // A square a few pixels short of a whole line fits one line fewer than it
  // looks like it should, and the note spills over the byline.
  it('are three, each a whole number of lines tall', () => {
    expect([8, 9, 10].map(stickySquare)).toEqual([217, 238, 258]);
    expect(STICKY_MIN_SIZE).toBe(217);
    expect(STICKY_MAX_SIZE).toBe(258);
  });

  it('set every note at one size', () => {
    expect(STICKY_FONT_SIZE).toBe(14);
  });
});

describe('stickySize without a layout engine', () => {
  // jsdom lays nothing out, so this is the estimate the board never uses.
  it('keeps a one-liner on the smallest square', () => {
    expect(stickySize('Ledger owns balances')).toBe(217);
  });

  it('steps up as a note needs more lines', () => {
    expect(stickySize('a'.repeat(230))).toBe(238);
    expect(stickySize('a'.repeat(300))).toBe(258);
  });

  it('measures the trimmed note', () => {
    expect(stickySize(`   ${'a'.repeat(200)}   `)).toBe(217);
  });

  it('fits a note at the cap on the largest square', () => {
    expect(STICKY_TEXT_LIMIT).toBe(280);
    expect(stickySize('a'.repeat(STICKY_TEXT_LIMIT))).toBe(STICKY_MAX_SIZE);
  });

  it('takes any note when there is nothing to measure it against', () => {
    expect(stickyFits('W'.repeat(STICKY_TEXT_LIMIT))).toBe(true);
  });
});

describe('stickySize with a layout engine', () => {
  /**
   * A stand-in layout: every character is `advance` wide, and a card is its
   * chrome plus however many lines the note wraps to at the probe's width.
   * Enough to show the size comes from how the note is laid out rather than
   * from how many characters it has.
   */
  function layOut(advance: number) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const width = parseFloat(this.style.width);
      const text = this.querySelector('p')?.textContent ?? '';
      const perLine = Math.floor((width - 28) / advance);
      const lines = Math.max(1, Math.ceil(text.length / perLine));
      return { height: 54.5 + lines * 20.3 } as DOMRect;
    });
  }

  // The failure this replaces: a note short enough by count for the first
  // square, whose words take more room than the count suggests. Sized by count
  // it stayed narrow and grew taller; laid out, it moves to a square it fits.
  it('moves a note that overflows up a square, whatever its length says', () => {
    layOut(10);
    const note = 'a'.repeat(180);

    expect(stickySize(note)).toBe(238);
  });

  it('keeps a note that fits on the smallest square that holds it', () => {
    layOut(10);

    expect(stickySize('a'.repeat(100))).toBe(217);
  });

  it('never makes a card taller than it is wide', () => {
    layOut(7);
    for (const length of [50, 150, 200, 250, 300, STICKY_TEXT_LIMIT]) {
      const size = stickySize('a'.repeat(length));
      const perLine = Math.floor((size - 28) / 7);
      const height = 54.5 + Math.ceil(length / perLine) * 20.3;

      expect(height).toBeLessThanOrEqual(size);
    }
  });

  // Ordinary prose at the cap is what the cap was measured against.
  it('takes a note of ordinary width all the way to the cap', () => {
    layOut(7);

    expect(stickyFits('a'.repeat(STICKY_TEXT_LIMIT))).toBe(true);
  });

  // The cap counts characters, and wide letters run out of paper first. There
  // is no fourth size to grow into, so the editors ask this and stop taking
  // text, rather than let the card grow taller than it is wide.
  it('refuses a note in wide letters that would outgrow the largest square', () => {
    layOut(13);

    expect(stickyFits('W'.repeat(STICKY_TEXT_LIMIT))).toBe(false);
    expect(stickyFits('W'.repeat(100))).toBe(true);
  });

  it('never grows past three sizes', () => {
    layOut(13);

    expect(stickySize('W'.repeat(STICKY_TEXT_LIMIT))).toBe(STICKY_MAX_SIZE);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { STICKY_TEXT_LIMIT } from '../artifactLimits';
import {
  STICKY_FONT_SIZE,
  STICKY_MAX_SIZE,
  STICKY_MIN_SIZE,
  fitToSticky,
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
    expect(STICKY_TEXT_LIMIT).toBe(290);
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

  // Enter held down at the end of a note: line breaks there are trimmed on
  // save, but they are on the paper while writing, and ignoring them let the
  // popup grow without end.
  it('counts line breaks, at the ends of the note too', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const lines = (this.querySelector('p')?.textContent ?? '').split('\n').length;
      return { height: 54.5 + lines * 20.3 } as DOMRect;
    });

    expect(stickyFits(`Idea${'\n'.repeat(5)}`)).toBe(true);
    expect(stickyFits(`Idea${'\n'.repeat(20)}`)).toBe(false);
    expect(stickyFits(`${'\n'.repeat(20)}Idea`)).toBe(false);
  });

  // A browser draws no line for a line break at the very end of a paragraph,
  // but in the box being typed into, that break has put the cursor on a new
  // one. Counting it is what refuses the Enter on the last line, instead of
  // taking it and leaving the cursor on a line the sticky does not have.
  it('counts the empty line a line break at the end starts', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      // As a browser lays it out: a final line break adds no line.
      const content = (this.querySelector('p')?.textContent ?? '').replace(/\n$/, '');
      const lines = content.split('\n').length;
      return { height: lines > 10 ? 400 : 100 } as DOMRect;
    });

    expect(stickyFits(`Idea${'\n'.repeat(9)}`)).toBe(true);
    expect(stickyFits(`Idea${'\n'.repeat(10)}`)).toBe(false);
  });

  describe('fitting a note that came from somewhere else', () => {
    // Ten lines to the largest sticky, a line break starting a line.
    const tenLines = () =>
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const lines = (this.querySelector('p')?.textContent ?? '').split('\n').length;
        return { height: lines > 10 ? 400 : 100 } as DOMRect;
      });

    it('leaves a note that fits exactly as it is', () => {
      tenLines();
      const note = `Idea\n\n\nThree blank lines are fine here`;

      expect(fitToSticky(note)).toBe(note);
    });

    // The draft that opened the popup thousands of pixels tall.
    it('closes up runs of blank lines before cutting any words', () => {
      tenLines();

      expect(fitToSticky(`Idea${'\n'.repeat(200)}End`)).toBe('Idea\n\nEnd');
    });

    it('cuts to the longest start that fits when closing up is not enough', () => {
      tenLines();
      const note = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`).join('\n');
      const fitted = fitToSticky(note);

      expect(fitted.split('\n')).toHaveLength(10);
      expect(note.startsWith(fitted)).toBe(true);
      expect(fitted.endsWith('line 10')).toBe(true);
    });
  });

  it('never grows past three sizes', () => {
    layOut(13);

    expect(stickySize('W'.repeat(STICKY_TEXT_LIMIT))).toBe(STICKY_MAX_SIZE);
  });
});

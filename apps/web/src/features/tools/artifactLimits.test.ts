import { describe, expect, it } from 'vitest';

import { prepareStickyText, STICKY_MAX_LINES, STICKY_TEXT_LIMIT } from './artifactLimits';

describe('prepareStickyText', () => {
  // Whitespace may be deliberate, so it is handed back untouched.
  it('keeps a sticky exactly as typed, whitespace included', () => {
    const typed = `  Keep the scope focused.  \n\n    and indented  `;
    expect(prepareStickyText(typed)).toEqual({ ok: true, text: typed });
  });

  it('rejects a blank sticky', () => {
    expect(prepareStickyText('  \n  ')).toEqual({
      ok: false,
      error: 'Write something before proposing this sticky.',
    });
  });

  it('accepts text at the editor limit', () => {
    expect(prepareStickyText('a'.repeat(STICKY_TEXT_LIMIT))).toEqual({
      ok: true,
      text: 'a'.repeat(STICKY_TEXT_LIMIT),
    });
  });

  it('rejects text over the editor limit', () => {
    expect(prepareStickyText('a'.repeat(STICKY_TEXT_LIMIT + 1))).toEqual({
      ok: false,
      error: `Keep your sticky to ${STICKY_TEXT_LIMIT} characters or fewer.`,
    });
  });

  it('accepts a sticky at the line limit, and rejects one over it', () => {
    const lines = (count: number) => Array.from({ length: count }, () => 'a').join('\n');
    expect(prepareStickyText(lines(STICKY_MAX_LINES)).ok).toBe(true);
    expect(prepareStickyText(lines(STICKY_MAX_LINES + 1))).toEqual({
      ok: false,
      error: `Keep your sticky to ${STICKY_MAX_LINES} lines or fewer.`,
    });
  });
});

import { describe, expect, it } from 'vitest';

import { prepareStickyText, STICKY_TEXT_LIMIT } from './artifactLimits';

describe('prepareStickyText', () => {
  it('trims a valid sticky before submission', () => {
    expect(prepareStickyText('  Keep the scope focused.  ')).toEqual({
      ok: true,
      text: 'Keep the scope focused.',
    });
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
});

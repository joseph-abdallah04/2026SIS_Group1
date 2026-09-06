import { describe, expect, it } from 'vitest';

import { stickyTypography } from './stickyPresentation';

describe('stickyTypography', () => {
  it('uses the board default for a short idea', () => {
    expect(stickyTypography('A focused idea')).toEqual({ fontSize: 14, lineHeight: 1.45 });
  });

  it('steps down for medium and long notes', () => {
    expect(stickyTypography('a'.repeat(91)).fontSize).toBe(12);
    expect(stickyTypography('a'.repeat(181)).fontSize).toBe(10);
  });
});

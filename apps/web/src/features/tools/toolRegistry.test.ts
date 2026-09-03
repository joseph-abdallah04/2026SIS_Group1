import { describe, expect, it } from 'vitest';

import { parseToolKind } from './toolRegistry';

describe('parseToolKind', () => {
  it.each(['sticky', 'drawing', 'diagram'] as const)('accepts the %s tool', (tool) => {
    expect(parseToolKind(tool)).toBe(tool);
  });

  it('ignores missing and unknown tools', () => {
    expect(parseToolKind(null)).toBeNull();
    expect(parseToolKind('paint')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { DIAGRAM_ARROW_LIMIT, DIAGRAM_TABLE_LIMIT } from '@roundtable/shared';

import { studioLimitError } from './studioLimits';

describe('studio limits', () => {
  it('says nothing while every count is within its limit', () => {
    expect(studioLimitError({ tables: DIAGRAM_TABLE_LIMIT, arrows: 3 })).toBeNull();
    expect(studioLimitError({})).toBeNull();
  });

  it('names what is over, and by what limit', () => {
    expect(studioLimitError({ tables: DIAGRAM_TABLE_LIMIT + 1 })).toBe(
      `A diagram can hold ${DIAGRAM_TABLE_LIMIT} tables at most.`,
    );
    expect(studioLimitError({ arrows: DIAGRAM_ARROW_LIMIT + 1 })).toBe(
      `A diagram can hold ${DIAGRAM_ARROW_LIMIT} arrows at most.`,
    );
  });
});

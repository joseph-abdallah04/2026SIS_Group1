import type { BoardItem } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { cardWidth } from './cardMetrics';
import { CARD_WIDTH } from './pinboardTokens';

type Measurable = Pick<BoardItem, 'type' | 'artifactJson'>;

const sticky = (text: string): Measurable => ({
  type: 'sticky',
  artifactJson: { type: 'sticky', text, color: 'yellow' },
});

describe('cardWidth', () => {
  it('grows a sticky with its note', () => {
    expect(cardWidth(sticky('Short'))).toBeLessThan(cardWidth(sticky('a'.repeat(250))));
  });

  // A drawing is whatever it was drawn at, so its width is a constant and must
  // not start following the artifact the way a sticky's does.
  it('leaves the drawn cards at their intrinsic width', () => {
    const drawing: Measurable = {
      type: 'drawing',
      artifactJson: { type: 'drawing', svg: '<svg/>' },
    };

    expect(cardWidth(drawing)).toBe(CARD_WIDTH.drawing);
  });
});

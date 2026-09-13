import type { BoardItem } from '@roundtable/shared';

import { stickySize } from '../tools/sticky/stickyPresentation';
import { CARD_WIDTH } from './pinboardTokens';

/**
 * How wide a card actually is on the board.
 *
 * Drawings and diagrams have one intrinsic width each. A sticky does not: it is
 * a square that grows with its note, so anything that measures a card — the
 * reaction row that has to wrap inside it, the bounds the board fits itself to,
 * the clamp that keeps it on the sheet — has to ask rather than assume.
 */
export function cardWidth(item: Pick<BoardItem, 'type' | 'artifactJson'>): number {
  return item.artifactJson.type === 'sticky'
    ? stickySize(item.artifactJson.text)
    : CARD_WIDTH[item.type];
}

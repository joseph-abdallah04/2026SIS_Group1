import type { BoardItem, ProposalType } from '@roundtable/shared';

import { CARD_WIDTH } from '../pinboard/pinboardTokens';

const BOARD_INSET = 32;
const CARD_GAP = 28;
const CARD_FOOTPRINT_HEIGHT = 260;
const GRID_COLUMNS = 4;
const GRID_CELL_WIDTH = CARD_WIDTH.diagram + CARD_GAP;
const GRID_CELL_HEIGHT = CARD_FOOTPRINT_HEIGHT + CARD_GAP;

type PositionedProposal = Pick<BoardItem, 'type' | 'x' | 'y'>;

interface ProposalPosition {
  x: number;
  y: number;
}

function overlaps(
  candidate: ProposalPosition,
  candidateType: ProposalType,
  item: PositionedProposal,
): boolean {
  return !(
    candidate.x + CARD_WIDTH[candidateType] + CARD_GAP <= item.x ||
    item.x + CARD_WIDTH[item.type] + CARD_GAP <= candidate.x ||
    candidate.y + CARD_FOOTPRINT_HEIGHT + CARD_GAP <= item.y ||
    item.y + CARD_FOOTPRINT_HEIGHT + CARD_GAP <= candidate.y
  );
}

export function findOpenProposalPosition(
  items: readonly PositionedProposal[],
  type: ProposalType,
): ProposalPosition {
  // Persist coordinates for F16; the current flex-wrap pinboard does not render them.
  const candidateCount = Math.max(1, items.length + 1) * GRID_COLUMNS;

  for (let index = 0; index < candidateCount; index += 1) {
    const candidate = {
      x: BOARD_INSET + (index % GRID_COLUMNS) * GRID_CELL_WIDTH,
      y: BOARD_INSET + Math.floor(index / GRID_COLUMNS) * GRID_CELL_HEIGHT,
    };

    if (items.every((item) => !overlaps(candidate, type, item))) return candidate;
  }

  const lowestItem = items.reduce(
    (lowest, item) => Math.max(lowest, item.y),
    BOARD_INSET - GRID_CELL_HEIGHT,
  );
  return { x: BOARD_INSET, y: lowestItem + GRID_CELL_HEIGHT };
}

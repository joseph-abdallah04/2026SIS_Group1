import type { ArtifactJson, BoardItem } from '@roundtable/shared';

import { getBoardCentre } from '../pinboard/boardView';
import { cardWidth } from '../pinboard/cardMetrics';
import { BOARD_SIZE, CARD_WIDTH } from '../pinboard/pinboardTokens';

const BOARD_INSET = 32;
const CARD_GAP = 28;
/** Tall enough for the largest sticky, which is as tall as it is wide. */
const CARD_FOOTPRINT_HEIGHT = 260;
const GRID_CELL_WIDTH = CARD_WIDTH.diagram + CARD_GAP;
const GRID_CELL_HEIGHT = CARD_FOOTPRINT_HEIGHT + CARD_GAP;

type PositionedProposal = Pick<BoardItem, 'type' | 'artifactJson' | 'x' | 'y'>;

interface ProposalPosition {
  x: number;
  y: number;
}

/**
 * Widths are what each card actually is, not what its type usually is: a
 * sticky grows with its note, and a check that took every sticky for the
 * smallest would put a new card over the edge of a long one.
 */
function overlaps(
  candidate: ProposalPosition,
  candidateWidth: number,
  item: PositionedProposal,
  itemWidth: number,
): boolean {
  return !(
    candidate.x + candidateWidth + CARD_GAP <= item.x ||
    item.x + itemWidth + CARD_GAP <= candidate.x ||
    candidate.y + CARD_FOOTPRINT_HEIGHT + CARD_GAP <= item.y ||
    item.y + CARD_FOOTPRINT_HEIGHT + CARD_GAP <= candidate.y
  );
}

/** Keeps a coordinate on the sheet: never negative, never past the far edge. */
function onSheet(value: number, max: number): number {
  return Math.round(Math.min(Math.max(value, 0), Math.max(0, max)));
}

/** Grid offsets on the ring `r` steps out from the centre, nearest first. */
function ring(r: number): ReadonlyArray<{ dx: number; dy: number }> {
  if (r === 0) return [{ dx: 0, dy: 0 }];
  const cells: { dx: number; dy: number }[] = [];
  for (let dx = -r; dx <= r; dx += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r) cells.push({ dx, dy });
    }
  }
  // Sort by true distance so a ring fills outwards evenly rather than
  // preferring its corners.
  return cells.sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
}

/** How far out to look before giving up and stacking below everything. */
const MAX_RINGS = 8;

/**
 * Where to put a proposal that is about to be made.
 *
 * It lands in the middle of what the viewer is currently looking at, then walks
 * outwards in rings until it finds a spot that clears the cards already there.
 * Starting at the board's top-left corner, as this did while positions were not
 * rendered, now means proposing into a part of the board nobody is looking at.
 *
 * Falls back to the corner when there is no board on screen to ask — tool
 * previews and tests.
 *
 * Takes the artifact being proposed rather than only its type, because a
 * sticky's width depends on what it says.
 */
export function findOpenProposalPosition(
  items: readonly PositionedProposal[],
  artifact: ArtifactJson,
): ProposalPosition {
  const width = cardWidth({ type: artifact.type, artifactJson: artifact });
  // Measured once, not once per cell tried against each of them.
  const widths = items.map((item) => cardWidth(item));
  const centre = getBoardCentre();
  const origin = centre
    ? {
        // Centre the card on the view, not its top-left corner on it.
        x: centre.x - width / 2,
        y: centre.y - CARD_FOOTPRINT_HEIGHT / 2,
      }
    : { x: BOARD_INSET, y: BOARD_INSET };

  for (let r = 0; r <= MAX_RINGS; r += 1) {
    for (const { dx, dy } of ring(r)) {
      // Kept wholly on the sheet: a proposal placed past its edge would sit
      // somewhere nobody can pan to.
      const candidate = {
        x: onSheet(origin.x + dx * GRID_CELL_WIDTH, BOARD_SIZE.width - width),
        y: onSheet(origin.y + dy * GRID_CELL_HEIGHT, BOARD_SIZE.height - CARD_FOOTPRINT_HEIGHT),
      };
      if (items.every((item, index) => !overlaps(candidate, width, item, widths[index]!))) {
        return candidate;
      }
    }
  }

  // Board is unusually crowded around the view: drop below everything instead.
  const lowestItem = items.reduce(
    (lowest, item) => Math.max(lowest, item.y),
    BOARD_INSET - GRID_CELL_HEIGHT,
  );
  return {
    x: onSheet(origin.x, BOARD_SIZE.width - width),
    y: onSheet(lowestItem + GRID_CELL_HEIGHT, BOARD_SIZE.height - CARD_FOOTPRINT_HEIGHT),
  };
}

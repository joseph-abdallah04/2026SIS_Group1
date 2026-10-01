import {
  BOARD_INSET,
  cardFootprint,
  findClearSpot,
  type ArtifactJson,
  type BoardItem,
  type CardRect,
} from '@roundtable/shared';

import { getBoardCentre } from '../pinboard/boardView';
import { cardWidth } from '../pinboard/cardMetrics';

type PositionedProposal = Pick<BoardItem, 'type' | 'artifactJson' | 'x' | 'y'>;

interface ProposalPosition {
  x: number;
  y: number;
}

/**
 * How much of the board a card covers, from its real width: a sticky is as
 * wide as this browser lays its note out, which the server cannot do.
 */
export function cardSize(item: Pick<BoardItem, 'type' | 'artifactJson'>) {
  return cardFootprint(item.type, item.type === 'sticky' ? cardWidth(item) : undefined);
}

/**
 * Where a proposal that is about to be made would like to land.
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
 * sticky's size depends on what it says.
 *
 * Given `near`, the search starts just to the right of that card instead,
 * level with its top: an extension belongs beside what it builds on, and the
 * rings then look for the closest free spot around there.
 *
 * Given `around`, a point on the board, the card is centred there instead —
 * where an image was dropped. Dropping one on a card still finds it a clear
 * spot beside it rather than burying what was underneath.
 *
 * Only a preference: this browser sees the board as it last heard of it, and
 * somebody else may be proposing into the same gap at the same moment. The
 * server makes the final call, with the same search, clear of every card that
 * landed first.
 */
export function findOpenProposalPosition(
  items: readonly PositionedProposal[],
  artifact: ArtifactJson,
  near?: PositionedProposal,
  around?: ProposalPosition,
): ProposalPosition {
  const size = cardSize({ type: artifact.type, artifactJson: artifact });
  const cards: CardRect[] = items.map((item) => ({ x: item.x, y: item.y, ...cardSize(item) }));
  const centre = getBoardCentre();
  const origin = near
    ? { x: near.x + cardSize(near).width + 28, y: near.y }
    : around
      ? { x: around.x - size.width / 2, y: around.y - size.height / 2 }
      : centre
        ? {
            // Centre the card on the view, not its top-left corner on it.
            x: centre.x - size.width / 2,
            y: centre.y - size.height / 2,
          }
        : { x: BOARD_INSET, y: BOARD_INSET };

  return findClearSpot(cards, size, origin);
}

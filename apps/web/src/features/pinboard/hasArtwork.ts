import type { BoardItem } from '@roundtable/shared';

import { canShowImage } from '../tools/image/canShowImage';

/**
 * Whether a proposal has a canvas worth opening.
 *
 * A sticky never has one: its card already shows every word. A drawing has one
 * once it has strokes, and a studio canvas once anything at all has been put on
 * it — a shape, a sketch, a path, a table or an arrow. An empty canvas shows
 * the same empty plate however large it is drawn.
 *
 * Its own module so that what a card can be exported as can ask it without
 * reaching back into the card.
 */
export function hasArtwork(item: BoardItem): boolean {
  const artifact = item.artifactJson;
  if (artifact.type === 'drawing') return artifact.svg.trim().length > 0;
  if (artifact.type === 'image') return canShowImage(artifact.src);
  if (artifact.type !== 'diagram') return false;
  return (
    artifact.nodes.length > 0 ||
    artifact.edges.length > 0 ||
    (artifact.ink?.length ?? 0) > 0 ||
    (artifact.paths?.length ?? 0) > 0 ||
    (artifact.tables?.length ?? 0) > 0 ||
    (artifact.arrows?.length ?? 0) > 0
  );
}

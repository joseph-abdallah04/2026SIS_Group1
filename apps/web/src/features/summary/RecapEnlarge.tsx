import type { BoardItem } from '@roundtable/shared';

import { CardFoot, ProposalArtwork } from '../pinboard/ProposalCard';
import { EnlargedView } from '../pinboard/ProposalEnlarge';
import { exportFormats } from '../pinboard/proposalExport';
import { STICKY_THEMES } from '../pinboard/pinboardTokens';
import { STICKY_LINE_HEIGHT, STICKY_NOTE_CLASS } from '../tools/sticky/stickyPresentation';
import { StickyText } from '../tools/sticky/StickyText';
import { useRecapContext } from './recapUi';

/**
 * Any card on the summary, looked at closely in the board's own enlarged view:
 * a drawing, diagram or image exactly as the board opens it (with its zoom and
 * its export), and a sticky note the way a note is held up close: a square
 * sheet of its own paper, its words large. One way in, whatever the card.
 */
export function RecapEnlarge({
  item,
  openedFrom,
  onClose,
}: {
  item: BoardItem;
  /** What was pressed to open it: the view opens over the surface it belongs to. */
  openedFrom: HTMLElement | null;
  onClose: () => void;
}) {
  const { viewerId, leaderId, actions } = useRecapContext();
  const artifact = item.artifactJson;
  const owned = viewerId !== null && item.authorId === viewerId;
  const format = actions ? exportFormats(item)[0] : undefined;
  const byline = (
    <CardFoot
      item={item}
      viewerId={viewerId}
      isOwnedByViewer={owned}
      isAuthorLeader={item.authorId != null && item.authorId === leaderId}
    />
  );

  if (artifact.type === 'sticky') {
    return (
      <EnlargedView
        item={item}
        artwork={
          <div
            data-sticky-note
            className={STICKY_NOTE_CLASS}
            style={{
              padding: 'clamp(16px, 6%, 26px)',
              // Clear of the view's close, which sits over the top-right corner.
              paddingRight: 56,
              fontSize: 'clamp(17px, 2.4vw, 21px)',
              lineHeight: STICKY_LINE_HEIGHT,
            }}
          >
            <StickyText note={artifact} links="open" />
          </div>
        }
        byline={byline}
        pressOutside="acts"
        openedFrom={openedFrom}
        onClose={onClose}
        paper={STICKY_THEMES[artifact.color].bg}
      />
    );
  }

  return (
    <EnlargedView
      item={item}
      artwork={<ProposalArtwork item={item} />}
      byline={byline}
      pressOutside="acts"
      openedFrom={openedFrom}
      onClose={onClose}
      exportFormat={format}
      onExport={format && actions ? () => actions.onExport(item, format) : undefined}
    />
  );
}

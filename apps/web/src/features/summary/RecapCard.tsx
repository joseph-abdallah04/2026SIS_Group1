import type { BoardItem } from '@roundtable/shared';

import { cardWidth } from '../pinboard/cardMetrics';
import { ProposalCard } from '../pinboard/ProposalCard';
import { FitCard } from './FitCard';
import { RecapProposalCard } from './RecapProposalCard';
import { useRecapContext } from './recapUi';

/**
 * One board card on the summary, fitted to the room it has. With the page's
 * card actions it opens the board's menu (Enlarge, Copy text, Export); a
 * picture of a summary (the landing page's) is just the card.
 */
export function RecapCard({ item, maxScale }: { item: BoardItem; maxScale?: number }) {
  const { viewerId, leaderId, actions } = useRecapContext();
  const owned = viewerId !== null && item.authorId === viewerId;
  const byLeader = item.authorId != null && item.authorId === leaderId;
  return (
    <FitCard width={cardWidth(item)} maxScale={maxScale}>
      {actions ? (
        <RecapProposalCard
          item={item}
          viewerId={viewerId}
          isOwnedByViewer={owned}
          isAuthorLeader={byLeader}
          onExport={actions.onExport}
          onCopyText={actions.onCopyText}
        />
      ) : (
        <ProposalCard
          item={item}
          viewerId={viewerId}
          isOwnedByViewer={owned}
          isAuthorLeader={byLeader}
        />
      )}
    </FitCard>
  );
}

/** A card as a small picture, for a row of results: nothing in it can be pressed. */
export function CardThumb({ item }: { item: BoardItem }) {
  const { viewerId, leaderId } = useRecapContext();
  return (
    <FitCard width={cardWidth(item)} still>
      <ProposalCard
        item={item}
        viewerId={viewerId}
        isOwnedByViewer={viewerId !== null && item.authorId === viewerId}
        isAuthorLeader={item.authorId != null && item.authorId === leaderId}
        interactive={false}
      />
    </FitCard>
  );
}

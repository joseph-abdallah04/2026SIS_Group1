import type { BoardItem } from '@roundtable/shared';

import { cardWidth } from '../pinboard/cardMetrics';
import { ProposalCard } from '../pinboard/ProposalCard';
import { ReactionRow } from '../pinboard/ReactionRow';

/**
 * A pinboard card as it appears in a session: the proposal plus the reaction
 * row that sits on its bottom edge. Decorative — reactions cannot be toggled.
 */
export function LandingSticky({
  item,
  isAuthorLeader = false,
}: {
  item: BoardItem;
  isAuthorLeader?: boolean;
}) {
  return (
    <div className="relative">
      <ProposalCard
        item={item}
        viewerId={null}
        isAuthorLeader={isAuthorLeader}
        interactive={false}
      />
      <ReactionRow
        reactions={item.reactions}
        viewerId={null}
        onReact={async () => {}}
        width={cardWidth(item)}
      />
    </div>
  );
}

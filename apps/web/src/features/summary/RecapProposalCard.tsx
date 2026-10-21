import { useCallback, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import type { BoardItem } from '@roundtable/shared';

import { CardMenuButton } from '../pinboard/CardMenuButton';
import { hasArtwork } from '../pinboard/hasArtwork';
import {
  contextMenuAnchor,
  ProposalActionsMenu,
  type ProposalMenuAnchor,
  type ProposalMenuItem,
} from '../pinboard/ProposalActionsMenu';
import { ProposalCard } from '../pinboard/ProposalCard';
import { EnlargeIcon } from '../pinboard/ProposalEnlarge';
import { CARD_RADIUS, MENU_TARGET_OUTLINE, STICKY_RADIUS } from '../pinboard/pinboardTokens';
import {
  exportMenuItems,
  PROPOSAL_KIND_LABEL,
  type ExportFormat,
} from '../pinboard/proposalExport';
import { RecapEnlarge } from './RecapEnlarge';

/**
 * What a card's menu offers on the summary, wherever the card is shown (in
 * full, or as a row of results): a closer look, a note's words, the artwork
 * as a file. `onEnlarge` is left out while the card is already enlarged.
 */
export function recapCardMenu(
  item: BoardItem,
  {
    onEnlarge,
    onCopyText,
    onExport,
  }: {
    onEnlarge?: () => void;
    onCopyText: (item: BoardItem) => void;
    onExport: (item: BoardItem, format: ExportFormat) => void;
  },
): ProposalMenuItem[][] {
  const isSticky = item.artifactJson.type === 'sticky';
  return [
    [
      // A note opens large too, in the same view, so every card is looked
      // at closely the same way on the summary.
      ...((hasArtwork(item) || isSticky) && onEnlarge
        ? [{ id: 'enlarge', label: 'Enlarge', icon: EnlargeIcon, onSelect: onEnlarge }]
        : []),
      ...(isSticky
        ? [{ id: 'copy', label: 'Copy text', icon: Copy, onSelect: () => onCopyText(item) }]
        : []),
      ...exportMenuItems(item, onExport),
    ],
  ];
}

/** The menu's name for screen readers: "Actions for Sticky note by Ada". */
export function recapCardMenuLabel(item: BoardItem, isOwnedByViewer: boolean): string {
  return `Actions for ${PROPOSAL_KIND_LABEL[item.type]} by ${
    isOwnedByViewer ? 'you' : item.authorName
  }`;
}

/**
 * One card on the meeting summary, with the actions a finished meeting still
 * has: a closer look, the words of a note, and the artwork as a file.
 *
 * Opened the way a card on the board opens its menu — right-click, or the ⋯ in
 * its corner — and from the same rows, so nothing has to be learned twice.
 * Nothing here changes the card: the meeting is over.
 */
export function RecapProposalCard({
  item,
  viewerId,
  isOwnedByViewer,
  isAuthorLeader,
  onExport,
  onCopyText,
}: {
  item: BoardItem;
  viewerId: string | null;
  isOwnedByViewer: boolean;
  isAuthorLeader: boolean;
  onExport: (item: BoardItem, format: ExportFormat) => void;
  onCopyText: (item: BoardItem) => void;
}) {
  const isSticky = item.artifactJson.type === 'sticky';
  const [menu, setMenu] = useState<ProposalMenuAnchor | null>(null);
  // Opened from the card's own corner and from this menu, so it is kept here:
  // the menu has to know it is open, to stop offering to open it again.
  const [enlargedOpen, setEnlargedOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  /** From the ⋯'s left edge, level with the top of the card, as on the board. */
  const cornerAnchor = (): ProposalMenuAnchor | null => {
    const button = menuButtonRef.current;
    const card = cardRef.current;
    if (!button || !card) return null;
    return {
      kind: 'corner',
      left: button.getBoundingClientRect().left,
      top: card.getBoundingClientRect().top,
    };
  };

  const sections = recapCardMenu(item, {
    onEnlarge: enlargedOpen ? undefined : () => setEnlargedOpen(true),
    onCopyText,
    onExport,
  });
  const hasActions = sections.some((section) => section.length > 0);

  return (
    <div
      ref={cardRef}
      data-menu-open={menu ? 'true' : undefined}
      className={`group relative ${menu ? 'outline-2 outline-offset-4' : ''} ${isSticky ? 'cursor-zoom-in' : ''}`}
      style={{
        borderRadius: isSticky ? STICKY_RADIUS : CARD_RADIUS,
        outlineColor: menu ? MENU_TARGET_OUTLINE : undefined,
      }}
      // A press on a note opens it large, as a press on a drawing's plate does;
      // not one on its menu or a link in it, and not the end of selecting words.
      onClick={(event) => {
        if (!isSticky) return;
        if ((event.target as HTMLElement).closest('a, button')) return;
        if (window.getSelection()?.toString()) return;
        setEnlargedOpen(true);
      }}
      onContextMenu={(event) => {
        if (!hasActions) return;
        const anchor = contextMenuAnchor(event, cornerAnchor);
        if (!anchor) return;
        event.preventDefault();
        setMenu(anchor);
      }}
    >
      <ProposalCard
        item={item}
        viewerId={viewerId}
        isOwnedByViewer={isOwnedByViewer}
        isAuthorLeader={isAuthorLeader}
        enlargedOpen={enlargedOpen}
        onEnlargedOpenChange={setEnlargedOpen}
        onExport={onExport}
      />
      {hasActions ? (
        <CardMenuButton
          buttonRef={menuButtonRef}
          open={menu !== null}
          onToggle={() => {
            const anchor = cornerAnchor();
            if (!anchor) return;
            setMenu((open) => (open ? null : anchor));
          }}
        />
      ) : null}
      {isSticky && enlargedOpen ? (
        <RecapEnlarge
          item={item}
          openedFrom={cardRef.current}
          onClose={() => setEnlargedOpen(false)}
        />
      ) : null}
      {menu ? (
        <ProposalActionsMenu
          anchor={menu}
          sections={sections}
          label={recapCardMenuLabel(item, isOwnedByViewer)}
          onClose={closeMenu}
          ignore={menuButtonRef}
        />
      ) : null}
    </div>
  );
}

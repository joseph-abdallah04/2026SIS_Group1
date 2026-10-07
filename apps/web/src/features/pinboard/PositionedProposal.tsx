import { useCallback, useEffect, useRef, useState } from 'react';
import { BringToFront, Copy, GitBranchPlus, Pencil, SendToBack, Trash2 } from 'lucide-react';
import type { BoardItem } from '@roundtable/shared';
import type { ProposalArrangeInput } from '@roundtable/shared/schemas';

import { CardMenuButton } from './CardMenuButton';
import { cardWidth } from './cardMetrics';
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog';
import { hasArtwork } from './hasArtwork';
import {
  contextMenuAnchor,
  ProposalActionsMenu,
  type ProposalMenuAnchor,
  type ProposalMenuItem,
} from './ProposalActionsMenu';
import { EnlargeIcon } from './ProposalEnlarge';
import { ProposalCard } from './ProposalCard';
import { exportMenuItems, type ExportFormat } from './proposalExport';
import { ReactionRow } from './ReactionRow';
import { VoteResultBadge } from '../voting/VoteResultBadge';
import {
  CARD_RADIUS,
  CARD_RADIUS_PX,
  cornerPoint,
  MENU_TARGET_OUTLINE,
  STICKY_RADIUS,
  STICKY_RADIUS_PX,
} from './pinboardTokens';

interface DragHandlers {
  onPointerDown: (item: BoardItem, event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
}

interface PositionedProposalProps {
  item: BoardItem;
  /**
   * Board coordinates to render at — mid-drag this is not `item.x/y`. Board
   * units, not screen pixels: the canvas scales the whole scene, so a card is
   * always laid out at its natural size and never consults the zoom.
   */
  position: { x: number; y: number };
  isNew: boolean;
  /** The viewer authored this, so they get the edit/delete affordances. */
  isOwn: boolean;
  /** The author runs this session, marked with an L beside their name. */
  isAuthorLeader: boolean;
  /**
   * The question is in discussion, so the board takes writes. Closed, the menu
   * keeps only what changes nothing — copying a note's text.
   */
  boardOpen: boolean;
  /**
   * Reopen this proposal in its own tool. Absent for kinds that cannot be
   * reopened, which is what decides whether the pencil is offered at all.
   */
  onOpenEditor?: (item: BoardItem) => void;
  /**
   * Open a copy of this proposal to build on it (F23). Absent while the board is
   * closed, and for a card there is nothing to copy from — a drawing proposed
   * before its strokes were kept — which is what hides Extend from the menu.
   */
  onExtend?: (item: BoardItem) => void;
  /**
   * The viewer may reposition this card: its author, or the leader arranging
   * the shared board. A move is visible to everyone.
   */
  canMove: boolean;
  /**
   * The viewer may take this card off the board — its author, or the leader
   * moderating. Editing stays strictly with the author, so this is separate.
   */
  canDelete: boolean;
  /** The viewer leads the session and the board is open: bring to front / send to back. */
  canArrange: boolean;
  /** This card's place in the stack, 0 at the bottom. */
  stackIndex: number;
  /** How many cards are stacked, so a raised card can clear every one of them. */
  stackSize: number;
  isDragging: boolean;
  /** Picked out with others to move together. */
  isSelected?: boolean;
  /** Omitted on a read-only board, where a card cannot be dragged. */
  dragHandlers?: DragHandlers;
  onDelete: (item: BoardItem) => Promise<void>;
  /** Restack this card. Settles on its own: the canvas reports a refusal. */
  onArrange: (item: BoardItem, to: ProposalArrangeInput['to']) => void;
  /** Put a sticky's text on the clipboard. The canvas says whether it worked. */
  onCopyText: (item: BoardItem) => void;
  /**
   * Save this card's artwork as a file. Offered whatever state the board is
   * in, closed and archived included: exporting changes nothing on it. The
   * canvas says how it went.
   */
  onExport?: (item: BoardItem, format: ExportFormat) => void;
  /**
   * Who the server says this client is, so the reaction row knows which chips
   * the viewer has already pressed. Null until the board is joined.
   */
  viewerId: string | null;
  /**
   * Toggle one of this viewer's reactions on this proposal (F18). Absent once
   * the board is frozen, when the reactions already left are shown read-only.
   */
  onReact?: (item: BoardItem, emoji: string) => Promise<void>;
  /** Whether this proposal is on the leader's voting shortlist (F27). */
  isShortlisted: boolean;
  /**
   * Closed-vote mark on an ended board. A winner or a tie replaces the
   * shortlist ring; absent means this card is only shortlisted, or neither.
   */
  resultKind?: 'winner' | 'tied' | null;
  /** Leader may add/remove this card while the shortlist is still open. */
  canToggleShortlist: boolean;
  onToggleShortlist: (id: string) => void;
  /** Last card the viewer interacted with, so the assistant can resolve "this one". */
  onSelectProposal?: (id: string) => void;
}

/** Movement past which a press on a card was a drag of it. */
const PRESS_SLOP_PX = 4;

/** What the confirmation calls the thing being removed. */
const PROPOSAL_KIND: Record<BoardItem['type'], string> = {
  sticky: 'sticky note',
  drawing: 'drawing',
  diagram: 'diagram',
  image: 'image',
};

/**
 * One card placed on the board (F16).
 *
 * `ProposalCard` stays presentational: this wrapper owns where a card sits and
 * who may change it, so a card renders identically for a viewer with no rights
 * over it.
 */
export function PositionedProposal({
  item,
  position,
  isNew,
  isOwn,
  isAuthorLeader,
  boardOpen,
  onOpenEditor,
  onExtend,
  canMove,
  canDelete,
  canArrange,
  stackIndex,
  stackSize,
  isDragging,
  isSelected = false,
  dragHandlers,
  onDelete,
  onArrange,
  onCopyText,
  onExport,
  viewerId,
  onReact,
  isShortlisted,
  resultKind = null,
  canToggleShortlist,
  onToggleShortlist,
  onSelectProposal,
}: PositionedProposalProps) {
  // Removal is destructive and cannot be undone, so it always passes through a
  // confirmation (F17) — for the author and the moderating leader alike.
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Paper or panel: the difference decides the corner every highlight follows.
  const isSticky = item.artifactJson.type === 'sticky';
  // The shortlist outline is a 2px ring, so its stroke runs 1px outside the
  // card and the marker that sits on it follows the card's own corner.
  const markerOffset = cornerPoint(isSticky ? STICKY_RADIUS_PX : CARD_RADIUS_PX, 1);
  // Every kind reopens in the tool that made it. A sticky opens its popup, which
  // is where its formatting can be changed, so an edit keeps the note as it was
  // written rather than flattening it in a plain box on the card. The canvas
  // only passes `onOpenEditor` while the board is open.
  const canEdit = isOwn && boardOpen && onOpenEditor !== undefined;
  const draggable = canMove && dragHandlers !== undefined;

  // Where the actions menu is open from, or null while it is shut. Opening it
  // from either the ⋯ or a right-click is the same menu.
  const [menu, setMenu] = useState<ProposalMenuAnchor | null>(null);
  // The preview is opened from the card's own corner and from this menu, so the
  // card cannot keep that to itself: the menu has to know it is open, to stop
  // offering to open it again.
  const [enlargedOpen, setEnlargedOpen] = useState(false);
  /**
   * Where a press began, and whether it began on the card's artwork.
   *
   * The card takes the pointer as soon as it is pressed, so it can be dragged;
   * that makes this wrapper, not the artwork, what the press ends up on. So the
   * press is judged here: on the artwork, and gone nowhere, opens the canvas.
   */
  const pressed = useRef<{ x: number; y: number; onPlate: boolean } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  /**
   * Where the ⋯ opens the menu: from the button's left edge, level with the
   * top of the card. Measured on screen, so it already accounts for the
   * board's pan and zoom.
   */
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

  /**
   * What this viewer can do to this card, in the groups the menu rules apart.
   *
   * Anything they are not allowed to do is left out rather than greyed, so the
   * menu is a list of real options. Bring to front and send to back are the
   * exception: they grey out at the end of the stack they would move the card
   * to, the way desktop apps do, because there they would do nothing.
   */
  const sections: ProposalMenuItem[][] = [
    [
      ...(hasArtwork(item) && !enlargedOpen
        ? [
            {
              id: 'enlarge',
              label: 'Enlarge',
              icon: EnlargeIcon,
              onSelect: () => setEnlargedOpen(true),
            },
          ]
        : []),
      ...(isSticky
        ? [{ id: 'copy', label: 'Copy text', icon: Copy, onSelect: () => onCopyText(item) }]
        : []),
      ...(canEdit
        ? [
            {
              id: 'edit',
              label: 'Edit',
              icon: Pencil,
              onSelect: () => onOpenEditor?.(item),
            },
          ]
        : []),
      ...(onExtend
        ? [{ id: 'extend', label: 'Extend', icon: GitBranchPlus, onSelect: () => onExtend(item) }]
        : []),
      // One row, its formats a level down, so the menu stays short.
      ...(onExport ? exportMenuItems(item, onExport) : []),
    ],
    canArrange
      ? [
          {
            id: 'front',
            label: 'Bring to front',
            icon: BringToFront,
            disabled: stackIndex === stackSize - 1,
            onSelect: () => onArrange(item, 'front'),
          },
          {
            id: 'back',
            label: 'Send to back',
            icon: SendToBack,
            disabled: stackIndex === 0,
            onSelect: () => onArrange(item, 'back'),
          },
        ]
      : [],
    canDelete
      ? [
          {
            id: 'delete',
            // Removing someone else's idea says so, rather than "Delete".
            label: isOwn ? 'Delete' : 'Remove',
            icon: Trash2,
            destructive: true,
            onSelect: () => setConfirmingRemove(true),
          },
        ]
      : [],
  ];
  const hasActions = sections.some((section) => section.length > 0);

  // What a viewer may do can change under an open menu — the leader moves the
  // question to voting, a proposal starts sending — and a menu left with
  // nothing in it would be an empty box floating over the board.
  useEffect(() => {
    if (menu && !hasActions) setMenu(null);
  }, [menu, hasActions]);

  const confirmRemove = () => {
    setRemoving(true);
    void onDelete(item)
      .then(() => {
        // The card leaves on the server's broadcast, taking this dialog with it.
      })
      .catch(() => {
        // Refused or offline: close the dialog and leave the card alone. The
        // canvas surfaces the reason, so the prompt does not repeat it.
        setRemoving(false);
        setConfirmingRemove(false);
      });
  };

  return (
    <div
      ref={cardRef}
      className={`group absolute ${
        resultKind === 'winner'
          ? 'ring-2 ring-rt-secondary ring-offset-2 ring-offset-rt-surface'
          : resultKind === 'tied'
            ? 'ring-2 ring-rt-cool ring-offset-2 ring-offset-rt-surface'
            : isShortlisted
              ? 'ring-2 ring-rt-secondary bg-rt-secondary-wash'
              : ''
      } ${
        // Which card the open menu belongs to, or that it is picked out to move
        // with others. An outline rather than another ring, so it can sit
        // outside the shortlist's ring without replacing it.
        menu || isSelected ? 'outline-solid' : ''
      }`}
      // Lets the board tell a press on a card from a press on empty board.
      data-proposal-card=""
      data-selected={isSelected ? 'true' : undefined}
      data-menu-open={menu ? 'true' : undefined}
      // Tells the canvas to leave this pointer gesture alone: dragging a card
      // you may move must not also pan the board underneath it. A card you may
      // not move carries no flag, so dragging it pans, which is what every
      // canvas tool does with something you cannot pick up.
      data-card-draggable={draggable ? 'true' : undefined}
      style={{
        left: position.x,
        // The shortlist ring is drawn on this wrapper, so it has to follow the
        // card's own corner: square on a sticky, rounded on every panel.
        borderRadius: isSticky ? STICKY_RADIUS : CARD_RADIUS,
        outlineColor: menu || isSelected ? MENU_TARGET_OUTLINE : undefined,
        // Divided by the zoom, so the outline stays two pixels on screen: drawn
        // inside the scaled board, a plain 2px went to a hairline zoomed out.
        outlineWidth: menu || isSelected ? 'calc(2px / var(--rt-board-scale, 1))' : undefined,
        outlineOffset: menu || isSelected ? 'calc(4px / var(--rt-board-scale, 1))' : undefined,
        top: position.y,
        // The shared stack at rest. A card being dragged or showing its menu is
        // lifted clear of every card instead, so what you are working on is
        // never under something else.
        zIndex: isDragging ? stackSize + 2 : menu ? stackSize + 1 : stackIndex + 1,
        // An arrow at rest, even on a card you may move. A hand on hover would
        // promise that grabbing is the only thing a card does, when clicking it
        // also reaches its Edit and Remove controls — and it would put a hand
        // over most of a busy board. The cursor changes once a drag is actually
        // under way, which is the moment it means something. During shortlisting
        // the card itself is the control, so a pointer is accurate.
        cursor: isDragging ? 'grabbing' : canToggleShortlist ? 'pointer' : 'default',
        // Without this the browser claims touch drags for scrolling first.
        touchAction: draggable ? 'none' : undefined,
        // Text inside a card must not become a selection while dragging it.
        userSelect: draggable ? 'none' : undefined,
        // No easing while dragging: the pointer is the animation, and easing
        // toward it reads as lag. Other people's moves do animate.
        transition: isDragging ? undefined : 'left 120ms ease-out, top 120ms ease-out',
      }}
      onPointerDown={(event) => {
        pressed.current = {
          x: event.clientX,
          y: event.clientY,
          onPlate: !!(event.target as HTMLElement).closest('[data-card-plate]'),
        };
        onSelectProposal?.(item.id);
        if (draggable) dragHandlers.onPointerDown(item, event);
      }}
      onPointerMove={draggable ? dragHandlers.onPointerMove : undefined}
      onPointerUp={draggable ? dragHandlers.onPointerUp : undefined}
      onPointerCancel={draggable ? dragHandlers.onPointerCancel : undefined}
      onContextMenu={(event) => {
        // Ctrl+click picks the card out with others on the board. On a Mac
        // the browser also treats it as a right-click and asks for a menu
        // first, which would open this one over the selection being made.
        if (event.ctrlKey && draggable) {
          event.preventDefault();
          return;
        }
        // The browser's own menu wherever ours has nothing to offer, over
        // anything in the card that takes text of its own, and over a link in a
        // sticky, where opening it in a new tab or copying its address is what
        // a right-click is for.
        if (!hasActions) return;
        const anchor = contextMenuAnchor(event, cornerAnchor);
        if (!anchor) return;
        event.preventDefault();
        setMenu(anchor);
      }}
      onClick={(event) => {
        // The corner tick and the ⋯ are their own presses.
        if ((event.target as HTMLElement).closest('button')) return;
        // A press with a modifier picked the card out; it opens nothing.
        if (event.shiftKey || event.metaKey || event.ctrlKey) return;
        if (canToggleShortlist) {
          onToggleShortlist(item.id);
          return;
        }
        const from = pressed.current;
        pressed.current = null;
        if (!from?.onPlate || !hasArtwork(item)) return;
        // A press that travelled was a drag across the board, not a press on
        // the artwork.
        if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > PRESS_SLOP_PX) return;
        setEnlargedOpen(true);
      }}
    >
      {resultKind ? <VoteResultBadge kind={resultKind} /> : null}
      {isShortlisted && !resultKind ? (
        <span className="absolute -top-2 left-2 z-10 rounded-full border border-rt-secondary bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-rt-secondary-deep">
          Shortlisted
        </span>
      ) : null}
      {canToggleShortlist ? (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleShortlist(item.id);
          }}
          className={`absolute z-50 flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
            isShortlisted
              ? 'border-rt-secondary bg-rt-secondary text-white'
              : 'border-rt-secondary bg-white text-rt-secondary'
          }`}
          style={{
            // Centred on the corner point of the shortlist outline itself,
            // which is the 45-degree point on the arc the card's radius cuts.
            // Derived rather than typed, so changing what a sticky's corner
            // looks like cannot leave this marker hanging beside it.
            top: markerOffset,
            left: markerOffset,
            transform: 'translate(-50%, -50%)',
            cursor: 'pointer',
          }}
          aria-label={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
        >
          {isShortlisted ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : null}
        </button>
      ) : null}

      <>
        <ProposalCard
          item={item}
          viewerId={viewerId}
          isNew={isNew}
          isOwnedByViewer={isOwn}
          isAuthorLeader={isAuthorLeader}
          isShortlisted={isShortlisted}
          enlargedOpen={enlargedOpen}
          // While the leader is shortlisting, a press on a card picks it.
          openOnArtworkPress={!canToggleShortlist}
          onEnlargedOpenChange={setEnlargedOpen}
          onExport={onExport}
        />

        {/* Always there, reacting or not: once the board closes for voting,
            what people said about each idea stays on it to be read. */}
        <ReactionRow
          reactions={item.reactions}
          viewerId={viewerId}
          onReact={onReact ? (emoji) => onReact(item, emoji) : undefined}
          width={cardWidth(item)}
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
      </>

      {menu ? (
        <ProposalActionsMenu
          anchor={menu}
          sections={sections}
          label={`Actions for ${PROPOSAL_KIND[item.type]} by ${isOwn ? 'you' : item.authorName}`}
          onClose={closeMenu}
          ignore={menuButtonRef}
        />
      ) : null}

      {confirmingRemove ? (
        <ConfirmRemoveDialog
          kind={PROPOSAL_KIND[item.type]}
          isOwn={isOwn}
          pending={removing}
          onCancel={() => setConfirmingRemove(false)}
          onConfirm={confirmRemove}
        />
      ) : null}
    </div>
  );
}

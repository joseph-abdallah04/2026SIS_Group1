import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BringToFront,
  Copy,
  GitBranchPlus,
  MoreHorizontal,
  Pencil,
  SendToBack,
  Trash2,
} from 'lucide-react';
import type { BoardItem } from '@roundtable/shared';
import type { ProposalArrangeInput } from '@roundtable/shared/schemas';

import { cardWidth } from './cardMetrics';
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog';
import {
  ProposalActionsMenu,
  type ProposalMenuAnchor,
  type ProposalMenuItem,
} from './ProposalActionsMenu';
import { ProposalCard } from './ProposalCard';
import { ReactionRow } from './ReactionRow';
import {
  CARD_INK,
  CARD_RADIUS,
  CARD_RADIUS_PX,
  cornerPoint,
  MENU_TARGET_OUTLINE,
  REACTION_HOVER_FILL,
  REACTION_ON_BORDER,
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
  dragHandlers: DragHandlers;
  onDelete: (item: BoardItem) => Promise<void>;
  /** Restack this card. Settles on its own: the canvas reports a refusal. */
  onArrange: (item: BoardItem, to: ProposalArrangeInput['to']) => void;
  /** Put a sticky's text on the clipboard. The canvas says whether it worked. */
  onCopyText: (item: BoardItem) => void;
  /**
   * Who the server says this client is, so the reaction row knows which chips
   * the viewer has already pressed. Null until the board is joined.
   */
  viewerId: string | null;
  /** Toggle one of this viewer's reactions on this proposal (F18). Absent once the board is frozen. */
  onReact?: (item: BoardItem, emoji: string) => Promise<void>;
  /** Whether this proposal is on the leader's voting shortlist (F27). */
  isShortlisted: boolean;
  /** Leader may add/remove this card while the shortlist is still open. */
  canToggleShortlist: boolean;
  onToggleShortlist: (id: string) => void;
}

/**
 * The ⋯ in a card's top-right corner, opening the same actions a right-click
 * does.
 *
 * One button where the pencil and the bin used to sit side by side: a card now
 * has more actions than its corner has room for icons, and a menu is also the
 * only way in on a touchscreen, which has no right-click. So it shows on hover
 * and focus as the old controls did, and always on a device that cannot hover.
 */
function CardMenuButton({
  buttonRef,
  open,
  onToggle,
}: {
  buttonRef: React.RefObject<HTMLButtonElement>;
  open: boolean;
  onToggle: () => void;
}) {
  // Pulled out by the same amount on both axes, so it sits centred on the
  // card's top-right corner rather than tucked inside it.
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      title="Proposal actions"
      aria-label="Proposal actions"
      aria-haspopup="menu"
      aria-expanded={open}
      className={`absolute -top-2.5 -right-2.5 inline-flex h-5.5 w-5.5 items-center justify-center rounded-full border shadow-sm transition-[opacity,background-color,border-color,color] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary ${
        open
          ? // The menu opens over this spot, so the button steps out of the way
            // rather than peeking out from under it.
            'pointer-events-none border-rt-tertiary bg-white text-rt-ink-muted opacity-0'
          : 'border-rt-tertiary bg-white text-rt-ink-muted opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:border-(--rt-control-edge) hover:bg-(--rt-control-fill) hover:text-(--rt-control-ink) [@media(hover:none)]:opacity-100'
      }`}
      style={
        {
          // The slate the reaction chips hover to, so the card's controls read
          // as one family. A hover colour cannot be an inline style, hence the
          // variables.
          '--rt-control-fill': REACTION_HOVER_FILL,
          '--rt-control-edge': REACTION_ON_BORDER,
          '--rt-control-ink': CARD_INK,
        } as React.CSSProperties
      }
    >
      <MoreHorizontal aria-hidden="true" size={13} strokeWidth={2.2} />
    </button>
  );
}

/** What the confirmation calls the thing being removed. */
const PROPOSAL_KIND: Record<BoardItem['type'], string> = {
  sticky: 'sticky note',
  drawing: 'drawing',
  diagram: 'diagram',
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
  dragHandlers,
  onDelete,
  onArrange,
  onCopyText,
  viewerId,
  onReact,
  isShortlisted,
  canToggleShortlist,
  onToggleShortlist,
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
  const draggable = canMove;

  // Where the actions menu is open from, or null while it is shut. Opening it
  // from either the ⋯ or a right-click is the same menu.
  const [menu, setMenu] = useState<ProposalMenuAnchor | null>(null);
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
        isShortlisted ? 'ring-2 ring-rt-secondary bg-rt-secondary-wash' : ''
      } ${
        // Which card the open menu belongs to. An outline rather than another
        // ring, so it can sit outside the shortlist's ring without replacing it.
        menu ? 'outline-2 outline-offset-4' : ''
      }`}
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
        outlineColor: menu ? MENU_TARGET_OUTLINE : undefined,
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
      onPointerDown={draggable ? (e) => dragHandlers.onPointerDown(item, e) : undefined}
      onPointerMove={draggable ? dragHandlers.onPointerMove : undefined}
      onPointerUp={draggable ? dragHandlers.onPointerUp : undefined}
      onPointerCancel={draggable ? dragHandlers.onPointerCancel : undefined}
      onContextMenu={(event) => {
        // The browser's own menu wherever ours has nothing to offer, over
        // anything in the card that takes text of its own, and over a link in a
        // sticky, where opening it in a new tab or copying its address is what
        // a right-click is for.
        if (!hasActions) return;
        const target = event.target as HTMLElement;
        if (target.closest('textarea, input, [contenteditable="true"], a[href]')) return;
        event.preventDefault();
        // The Menu key and Shift+F10 fire this too, from whatever is focused
        // inside the card and with no pointer position, so the menu opens
        // where the ⋯ would open it instead of in the window's corner.
        const fromKeyboard = event.clientX === 0 && event.clientY === 0;
        const rect = event.currentTarget.getBoundingClientRect();
        setMenu(
          fromKeyboard
            ? (cornerAnchor() ?? { kind: 'corner', left: rect.right, top: rect.top })
            : { kind: 'point', x: event.clientX, y: event.clientY },
        );
      }}
      onClick={
        canToggleShortlist
          ? (event) => {
              // The corner tick is its own button and already toggles.
              if ((event.target as HTMLElement).closest('button')) return;
              onToggleShortlist(item.id);
            }
          : undefined
      }
    >
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
        />

        {onReact ? (
          <ReactionRow
            reactions={item.reactions}
            viewerId={viewerId}
            onReact={(emoji) => onReact(item, emoji)}
            width={cardWidth(item)}
          />
        ) : null}

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

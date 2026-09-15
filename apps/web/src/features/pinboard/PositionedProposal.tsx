import { useState, type ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { BoardItem } from '@roundtable/shared';

import { cardWidth } from './cardMetrics';
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog';
import { ProposalCard } from './ProposalCard';
import { ReactionRow } from './ReactionRow';
import {
  CARD_INK,
  CARD_RADIUS,
  CARD_RADIUS_PX,
  cornerPoint,
  REACTION_HOVER_FILL,
  REACTION_ON_BORDER,
  REMOVE_HOVER_BORDER,
  REMOVE_HOVER_FILL,
  REMOVE_HOVER_INK,
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
   * Reopen this proposal in its own tool. Absent for kinds that cannot be
   * reopened, which is what decides whether the pencil is offered at all.
   */
  onOpenEditor?: (item: BoardItem) => void;
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
  isDragging: boolean;
  dragHandlers: DragHandlers;
  onDelete: (item: BoardItem) => Promise<void>;
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
  /** Last card the viewer interacted with, so the assistant can resolve "this one". */
  onSelectProposal?: (id: string) => void;
}

/**
 * A card control: icon only, because the card is 210px wide and two text pills
 * across its top edge crowd the note itself. The label is not dropped, only
 * moved — it stays as the accessible name and the tooltip, so what the button
 * does is still discoverable by hover, by keyboard and by screen reader.
 */
function CardControl({
  label,
  onClick,
  destructive = false,
  children,
}: {
  label: string;
  onClick: () => void;
  /** Turns the hover red, so removal does not look like every other action. */
  destructive?: boolean;
  children: ReactNode;
}) {
  // Both controls share one hover rule and differ only in the colours handed
  // to it, because a hover colour cannot be an inline style. Editing takes the
  // same slate the reaction chips use; removing takes the red.
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={
        {
          '--rt-control-fill': destructive ? REMOVE_HOVER_FILL : REACTION_HOVER_FILL,
          '--rt-control-edge': destructive ? REMOVE_HOVER_BORDER : REACTION_ON_BORDER,
          '--rt-control-ink': destructive ? REMOVE_HOVER_INK : CARD_INK,
        } as React.CSSProperties
      }
      className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-rt-tertiary bg-white text-rt-ink-muted shadow-sm transition-colors hover:border-(--rt-control-edge) hover:bg-(--rt-control-fill) hover:text-(--rt-control-ink) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary"
    >
      {children}
    </button>
  );
}

/** Edit / delete controls, shown on a card the viewer may change. */
function OwnerControls({
  canEdit,
  canDelete,
  isOwn,
  onEdit,
  onDelete,
}: {
  canEdit: boolean;
  canDelete: boolean;
  /** False when the leader is moderating a card someone else proposed. */
  isOwn: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Pulled out by the same amount on both axes, so the last control — the bin —
  // sits centred on the card's top-right corner rather than tucked inside it.
  return (
    <div className="absolute -top-2.5 -right-2.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      {canEdit ? (
        <CardControl label="Edit proposal" onClick={onEdit}>
          <Pencil aria-hidden="true" size={12} strokeWidth={2} />
        </CardControl>
      ) : null}
      {canDelete ? (
        <CardControl
          // Removing someone else's idea deserves naming what is happening.
          label={isOwn ? 'Delete proposal' : 'Remove as session leader'}
          onClick={onDelete}
          destructive
        >
          <Trash2 aria-hidden="true" size={12} strokeWidth={2} />
        </CardControl>
      ) : null}
    </div>
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
  onOpenEditor,
  canMove,
  canDelete,
  isDragging,
  dragHandlers,
  onDelete,
  viewerId,
  onReact,
  isShortlisted,
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
  // written rather than flattening it in a plain box on the card.
  const boardFrozen = !canMove && !canDelete && onOpenEditor === undefined;
  const canEdit = isOwn && !boardFrozen && onOpenEditor !== undefined;
  const draggable = canMove;

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
      className={`group absolute ${
        isShortlisted ? 'ring-2 ring-rt-secondary bg-rt-secondary-wash' : ''
      }`}
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
        top: position.y,
        // A card being dragged belongs above its neighbours.
        zIndex: isDragging ? 30 : 1,
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
      onPointerDown={
        draggable
          ? (e) => {
              onSelectProposal?.(item.id);
              dragHandlers.onPointerDown(item, e);
            }
          : onSelectProposal
            ? () => onSelectProposal(item.id)
            : undefined
      }
      onPointerMove={draggable ? dragHandlers.onPointerMove : undefined}
      onPointerUp={draggable ? dragHandlers.onPointerUp : undefined}
      onPointerCancel={draggable ? dragHandlers.onPointerCancel : undefined}
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

        {canEdit || canDelete ? (
          <OwnerControls
            canEdit={canEdit}
            canDelete={canDelete}
            isOwn={isOwn}
            onEdit={() => onOpenEditor?.(item)}
            onDelete={() => setConfirmingRemove(true)}
          />
        ) : null}
      </>

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

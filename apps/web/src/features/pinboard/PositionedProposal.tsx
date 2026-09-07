import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { BoardItem, StickyArtifact } from '@roundtable/shared';

import { ConfirmRemoveDialog } from './ConfirmRemoveDialog';
import { ProposalCard } from './ProposalCard';
import { ReactionRow } from './ReactionRow';
import { CARD_INK, CARD_SHADOW, CARD_WIDTH, STICKY_RADIUS, STICKY_THEMES } from './pinboardTokens';

/** Matches `stickyArtifactSchema` — the server rejects anything longer. */
const STICKY_MAX_CHARS = 2000;

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
  onEditText: (item: BoardItem, text: string) => Promise<void>;
  onDelete: (item: BoardItem) => Promise<void>;
  /**
   * Who the server says this client is, so the reaction row knows which chips
   * the viewer has already pressed. Null until the board is joined.
   */
  viewerId: string | null;
  /** Toggle one of this viewer's reactions on this proposal (F18). */
  onReact: (item: BoardItem, emoji: string) => Promise<void>;
  /** Whether this proposal is on the leader's voting shortlist (F27). */
  isShortlisted: boolean;
  /** True once voting has started and the shortlist can no longer change. */
  shortlistLocked: boolean;
  isLeader: boolean;
  onToggleShortlist: (id: string) => void;
}

/**
 * Inline text editor for a sticky you authored.
 *
 * Stickies edit here, because a sticky is one field and a full-screen editor
 * for it would be heavier than the change. Drawings and diagrams reopen in the
 * Creative Tools studio (F19–F21) instead, which is the only place their
 * shapes can be manipulated.
 */
function StickyTextEditor({
  artifact,
  width,
  onSave,
  onCancel,
}: {
  artifact: StickyArtifact;
  width: number;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(artifact.text);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const theme = STICKY_THEMES[artifact.color];

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const trimmed = text.trim();
  const unchanged = trimmed === artifact.text.trim();
  const submittable = !saving && !unchanged && trimmed.length > 0;

  const submit = () => {
    if (!submittable) return;
    setSaving(true);
    void onSave(trimmed)
      .then(() => {
        // Parent closes the editor on success.
      })
      .catch(() => {
        // Keep the editor open with the typed text so a rejected save is not lost.
        setSaving(false);
      });
  };

  return (
    <div
      className="flex flex-col overflow-hidden border"
      style={{
        width,
        borderRadius: STICKY_RADIUS,
        borderColor: theme.border,
        background: theme.bg,
        boxShadow: CARD_SHADOW,
      }}
    >
      <textarea
        ref={ref}
        value={text}
        maxLength={STICKY_MAX_CHARS}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          // Enter saves, Shift+Enter adds a line — the usual bargain for a
          // one-field editor people use dozens of times in a session.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="resize-none bg-transparent outline-none"
        style={{
          minHeight: 128,
          padding: '16px 14px 8px',
          fontSize: '14px',
          fontWeight: 500,
          lineHeight: 1.45,
          color: CARD_INK,
        }}
        aria-label="Edit sticky note text"
      />
      <div className="flex items-center gap-2 px-3 pb-2.5">
        <button
          type="button"
          onClick={submit}
          disabled={!submittable}
          className="rounded-full bg-rt-secondary px-3 py-[5px] text-[11px] font-semibold text-rt-ink disabled:opacity-45 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-secondary"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-2.5 py-[5px] text-[11px] font-medium text-rt-ink-muted hover:bg-white/60 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
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
  /** Warms the hover colour, so removal does not look like every other action. */
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-rt-tertiary bg-white text-rt-ink-muted shadow-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary ${
        destructive
          ? 'hover:border-rt-secondary hover:bg-rt-secondary-wash hover:text-rt-secondary-deep'
          : 'hover:bg-rt-primary-tint hover:text-rt-ink'
      }`}
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
  onEditText,
  onDelete,
  viewerId,
  onReact,
  isShortlisted,
  shortlistLocked,
  isLeader,
  onToggleShortlist,
}: PositionedProposalProps) {
  const [editing, setEditing] = useState(false);
  // Removal is destructive and cannot be undone, so it always passes through a
  // confirmation (F17) — for the author and the moderating leader alike.
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  // A sticky is edited in place — it is one field, and a full-screen editor for
  // it would be heavier than the change. Anything else reopens in the tool that
  // made it, which is the only place its shape can be manipulated.
  const editsInline = isOwn && item.artifactJson.type === 'sticky';
  const canEdit = isOwn && (editsInline || onOpenEditor !== undefined);
  const draggable = canMove && !editing;

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
        top: position.y,
        // A card being dragged, or edited, belongs above its neighbours.
        zIndex: isDragging ? 30 : editing ? 20 : 1,
        // An arrow at rest, even on a card you may move. A hand on hover would
        // promise that grabbing is the only thing a card does, when clicking it
        // also reaches its Edit and Remove controls — and it would put a hand
        // over most of a busy board. The cursor changes once a drag is actually
        // under way, which is the moment it means something.
        cursor: isDragging ? 'grabbing' : 'default',
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
    >
      {isShortlisted ? (
        <div className="absolute top-1 right-1 rounded bg-rt-secondary px-2 py-0.5 text-[10px] text-white">
          Shortlisted
        </div>
      ) : null}

      {isLeader && !shortlistLocked ? (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleShortlist(item.id);
          }}
          className={`absolute -top-2 -left-2 z-50 flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
            isShortlisted
              ? 'border-rt-secondary bg-rt-secondary text-white'
              : 'border-rt-secondary bg-white text-rt-secondary'
          }`}
          style={{
            transform: 'translate(-20%, -20%)',
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

      {editing && item.artifactJson.type === 'sticky' ? (
        <StickyTextEditor
          artifact={item.artifactJson}
          width={CARD_WIDTH.sticky}
          onCancel={() => setEditing(false)}
          onSave={async (text) => {
            await onEditText(item, text);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <ProposalCard
            item={item}
            isNew={isNew}
            isOwnedByViewer={isOwn}
            isAuthorLeader={isAuthorLeader}
            isShortlisted={isShortlisted}
          />

          <ReactionRow
            reactions={item.reactions}
            viewerId={viewerId}
            onReact={(emoji) => onReact(item, emoji)}
          />

          {canEdit || canDelete ? (
            <OwnerControls
              canEdit={canEdit}
              canDelete={canDelete}
              isOwn={isOwn}
              onEdit={() => (editsInline ? setEditing(true) : onOpenEditor?.(item))}
              onDelete={() => setConfirmingRemove(true)}
            />
          ) : null}
        </>
      )}

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

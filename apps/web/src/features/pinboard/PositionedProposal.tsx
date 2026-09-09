import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { BoardItem, StickyArtifact } from '@roundtable/shared';

import { prepareStickyText, STICKY_TEXT_LIMIT } from '../tools/artifactLimits';
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog';
import { ProposalCard } from './ProposalCard';
import { ReactionRow } from './ReactionRow';
import {
  CARD_INK,
  CARD_WIDTH,
  REACTION_HOVER_FILL,
  REACTION_ON_BORDER,
  REMOVE_HOVER_BORDER,
  REMOVE_HOVER_FILL,
  REMOVE_HOVER_INK,
  STICKY_RADIUS,
  STICKY_SHADOW,
  STICKY_SIZE,
  STICKY_THEMES,
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
  onEditText: (item: BoardItem, text: string) => Promise<void>;
  onDelete: (item: BoardItem) => Promise<void>;
  /**
   * Who the server says this client is, so the reaction row knows which chips
   * the viewer has already pressed. Null until the board is joined.
   */
  viewerId: string | null;
  /** Toggle one of this viewer's reactions on this proposal (F18). */
  onReact: (item: BoardItem, emoji: string) => Promise<void>;
}

/**
 * Inline text editor for a sticky you authored.
 *
 * Stickies edit here, because a sticky is one field and a full-screen editor
 * for it would be heavier than the change. Drawings and diagrams reopen in the
 * Creative Tools studio (F19–F21) instead, which is the only place their
 * shapes can be manipulated.
 *
 * The length rule is the same one the tool enforces when a sticky is written,
 * and comes from the same place. Editing used to stop only at the schema's
 * outer bound, so a note capped at 280 characters on the way in could be grown
 * to 2000 immediately afterwards, on a card that is only 210px square.
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
  const prepared = prepareStickyText(text);
  const submittable = !saving && !unchanged && prepared.ok;
  /**
   * Shown as soon as it is true, not on a press.
   *
   * Save is disabled while the note is too long, so a message that waited for
   * a click would wait for one that cannot land. Typing cannot get you here —
   * the field stops at the limit — but a note written before the limit
   * existed, or through another client, opens over it.
   */
  const tooLong = !prepared.ok && trimmed.length > STICKY_TEXT_LIMIT ? prepared.error : null;

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
      className="flex flex-col overflow-hidden"
      style={{
        width,
        height: STICKY_SIZE,
        borderRadius: STICKY_RADIUS,
        background: theme.bg,
        boxShadow: STICKY_SHADOW,
      }}
    >
      <textarea
        ref={ref}
        value={text}
        maxLength={STICKY_TEXT_LIMIT}
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
        className="min-h-0 flex-1 resize-none bg-transparent outline-none"
        style={{
          padding: '14px 14px 6px',
          fontSize: '14px',
          fontWeight: 500,
          lineHeight: 1.45,
          color: CARD_INK,
        }}
        aria-label="Edit sticky note text"
      />
      {tooLong ? (
        <p role="alert" className="px-3 pb-1 text-[10.5px] leading-snug text-rt-secondary-deep">
          {tooLong}
        </p>
      ) : null}

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
        {/* The same count the tool shows while a sticky is being written, so
            the ceiling does not appear to move between writing and editing. */}
        <span
          aria-live="polite"
          className={`ml-auto text-[10px] tabular-nums ${
            trimmed.length >= STICKY_TEXT_LIMIT ? 'text-rt-secondary-deep' : 'text-rt-ink-faint'
          }`}
        >
          {trimmed.length}/{STICKY_TEXT_LIMIT}
        </span>
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
  onEditText,
  onDelete,
  viewerId,
  onReact,
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
      className="group absolute"
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
          />

          <ReactionRow
            reactions={item.reactions}
            viewerId={viewerId}
            onReact={(emoji) => onReact(item, emoji)}
            width={CARD_WIDTH[item.type]}
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

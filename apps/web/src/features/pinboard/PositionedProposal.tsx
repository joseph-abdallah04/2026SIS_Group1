import { useEffect, useRef, useState } from 'react';
import type { BoardItem, StickyArtifact } from '@roundtable/shared';

import { ProposalCard } from './ProposalCard';
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
}

/**
 * Inline text editor for a sticky you authored.
 *
 * Stickies edit here; drawings and diagrams reopen in the Creative Tools
 * studio (F19–F21) — that wire-up is a follow-up, so those cards can only be
 * moved or deleted for now.
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
        <span className="ml-auto text-[10px] text-rt-ink-faint">Esc to cancel</span>
      </div>
    </div>
  );
}

/** Edit / delete controls, shown only on a card the viewer authored. */
function OwnerControls({
  canEditText,
  canDelete,
  isOwn,
  onEdit,
  onDelete,
}: {
  canEditText: boolean;
  canDelete: boolean;
  /** False when the leader is moderating a card someone else proposed. */
  isOwn: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Two-step rather than a confirm dialog: a proposal others may have reacted
  // to or extended should not vanish on one stray click, but a modal is heavier
  // than this decision deserves. Disarms itself so it cannot sit primed.
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <div className="absolute -top-2.5 right-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      {canEditText ? (
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full border border-rt-tertiary bg-white px-2.5 py-[3px] text-[10.5px] font-medium text-rt-ink-muted shadow-sm hover:text-rt-ink focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-rt-secondary"
        >
          Edit
        </button>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          onClick={() => (armed ? onDelete() : setArmed(true))}
          // Removing someone else's idea deserves naming what is happening.
          title={isOwn ? 'Remove your proposal' : 'Remove as session leader'}
          aria-label={armed ? 'Confirm delete' : isOwn ? 'Delete proposal' : 'Remove as leader'}
          className={`rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium shadow-sm focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-rt-secondary ${
            armed
              ? 'border-rt-secondary bg-rt-secondary-wash text-rt-secondary-deep'
              : 'border-rt-tertiary bg-white text-rt-ink-muted hover:text-rt-ink'
          }`}
        >
          {armed ? 'Remove?' : isOwn ? 'Delete' : 'Remove'}
        </button>
      ) : null}
    </div>
  );
}

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
  canMove,
  canDelete,
  isDragging,
  dragHandlers,
  onEditText,
  onDelete,
}: PositionedProposalProps) {
  const [editing, setEditing] = useState(false);
  // Stickies edit inline; drawings/diagrams wait for studio reopen (F20/F21).
  const canEditText = isOwn && item.artifactJson.type === 'sticky';
  const draggable = canMove && !editing;

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
          {canEditText || canDelete ? (
            <OwnerControls
              canEditText={canEditText}
              canDelete={canDelete}
              isOwn={isOwn}
              onEdit={() => setEditing(true)}
              onDelete={() => void onDelete(item)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

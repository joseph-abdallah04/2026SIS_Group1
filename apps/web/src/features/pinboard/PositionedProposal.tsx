import { useEffect, useRef, useState } from 'react';
import type { BoardItem, StickyArtifact } from '@roundtable/shared';

import { ProposalCard } from './ProposalCard';
import {
  CARD_SHADOW,
  STICKY_RADIUS,
  STICKY_THEMES,
  cardWidthPx,
  type ZoomLevel,
} from './pinboardTokens';

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
  zoom: ZoomLevel;
  scale: number;
  /** Board coordinates to render at — mid-drag this is not `item.x/y`. */
  position: { x: number; y: number };
  isNew: boolean;
  /** The viewer authored this, so they get the edit/delete affordances. */
  isOwn: boolean;
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
 * Deliberately the only editor here: F16 covers "edit content (text for
 * stickies)", while drawings and diagrams are edited in the tools owner's
 * editors (F19–F21), which do not exist yet. A half-editor for those would be
 * worse than none.
 */
function StickyTextEditor({
  artifact,
  width,
  onSave,
  onCancel,
}: {
  artifact: StickyArtifact;
  width: number;
  onSave: (text: string) => void;
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
    onSave(trimmed);
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
        className="resize-none bg-transparent px-3.5 py-3 text-[14px] leading-[1.45] font-medium text-rt-ink outline-none"
        style={{ minHeight: 110 }}
        aria-label="Edit sticky note text"
      />
      <div className="flex items-center gap-2 px-3 pb-2.5">
        <button
          type="button"
          onClick={submit}
          disabled={!submittable}
          className="rounded-full bg-rt-primary px-3 py-[5px] text-[11px] font-semibold text-white disabled:opacity-45 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-primary"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-2.5 py-[5px] text-[11px] font-medium text-rt-ink-muted hover:bg-white/60 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-primary"
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
          className="rounded-full border border-rt-tertiary bg-white px-2.5 py-[3px] text-[10.5px] font-medium text-rt-ink-muted shadow-sm hover:text-rt-ink focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-rt-primary"
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
          className={`rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium shadow-sm focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-rt-primary ${
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
  zoom,
  scale,
  position,
  isNew,
  isOwn,
  canMove,
  canDelete,
  isDragging,
  dragHandlers,
  onEditText,
  onDelete,
}: PositionedProposalProps) {
  const [editing, setEditing] = useState(false);
  // Editing is the author's alone; a sticky is the only kind with an editor
  // until the tools owner's F19–F21 land.
  const canEditText = isOwn && item.artifactJson.type === 'sticky';
  const draggable = canMove && !editing;

  return (
    <div
      className="group absolute"
      style={{
        left: position.x * scale,
        top: position.y * scale,
        // A card being dragged, or edited, belongs above its neighbours.
        zIndex: isDragging ? 30 : editing ? 20 : 1,
        cursor: draggable ? (isDragging ? 'grabbing' : 'grab') : 'default',
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
          width={cardWidthPx('sticky', zoom)}
          onCancel={() => setEditing(false)}
          onSave={(text) => {
            void onEditText(item, text).finally(() => setEditing(false));
          }}
        />
      ) : (
        <>
          <ProposalCard item={item} zoom={zoom} isNew={isNew} isOwnedByViewer={isOwn} />
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

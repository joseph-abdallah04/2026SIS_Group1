import { useEffect, useRef, useState } from 'react';
import type { BoardItem, StickyArtifact } from '@roundtable/shared';

import { ProposalCard } from './ProposalCard';
import { CARD_INK, CARD_SHADOW, CARD_WIDTH, STICKY_RADIUS, STICKY_THEMES } from './pinboardTokens';

import { toggleShortlist } from '../../lib/sessionStore';

const STICKY_MAX_CHARS = 2000;

interface DragHandlers {
  onPointerDown: (item: BoardItem, event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
}

interface PositionedProposalProps {
  item: BoardItem;
  position: { x: number; y: number };
  isNew: boolean;
  isOwn: boolean;
  isAuthorLeader: boolean;
  canMove: boolean;
  canDelete: boolean;
  isDragging: boolean;
  dragHandlers: DragHandlers;
  onEditText: (item: BoardItem, text: string) => Promise<void>;
  onDelete: (item: BoardItem) => Promise<void>;

  // F27 shortlist props
  isShortlisted: boolean;
  shortlistLocked: boolean;
  isLeader: boolean;
}

function StickyTextEditor({ artifact, width, onSave, onCancel }: {
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
      .then(() => {})
      .catch(() => setSaving(false));
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
          className="rounded-full bg-rt-secondary px-3 py-[5px] text-[11px] font-semibold text-rt-ink disabled:opacity-45"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-2.5 py-[5px] text-[11px] font-medium text-rt-ink-muted hover:bg-white/60"
        >
          Cancel
        </button>
        <span className="ml-auto text-[10px] text-rt-ink-faint">Esc to cancel</span>
      </div>
    </div>
  );
}

function OwnerControls({ canEditText, canDelete, isOwn, onEdit, onDelete }: {
  canEditText: boolean;
  canDelete: boolean;
  isOwn: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <div className="absolute -top-2.5 right-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      {canEditText && (
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full border bg-white px-2.5 py-[3px] text-[10.5px] font-medium text-rt-ink-muted shadow-sm hover:text-rt-ink"
        >
          Edit
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={() => (armed ? onDelete() : setArmed(true))}
          className={`rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium shadow-sm ${
            armed
              ? 'border-rt-secondary bg-rt-secondary-wash text-rt-secondary-deep'
              : 'border-rt-tertiary bg-white text-rt-ink-muted hover:text-rt-ink'
          }`}
        >
          {armed ? 'Remove?' : isOwn ? 'Delete' : 'Remove'}
        </button>
      )}
    </div>
  );
}

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
  isShortlisted,
  shortlistLocked,
  isLeader,
}: PositionedProposalProps) {
  const [editing, setEditing] = useState(false);
  const canEditText = isOwn && item.artifactJson.type === 'sticky';
  const draggable = canMove && !editing;

  return (
    <div
      className={`group absolute ${
        isShortlisted ? "ring-2 ring-rt-secondary bg-rt-secondary-wash" : ""
      }`}
      data-card-draggable={draggable ? 'true' : undefined}
      style={{
        left: position.x,
        top: position.y,
        borderRadius: STICKY_RADIUS,
        zIndex: isDragging ? 30 : editing ? 20 : 1,
        cursor: isDragging ? 'grabbing' : 'default',
        touchAction: draggable ? 'none' : undefined,
        userSelect: draggable ? 'none' : undefined,
        transition: isDragging ? undefined : 'left 120ms ease-out, top 120ms ease-out',
      }}
      onPointerDown={draggable ? (e) => dragHandlers.onPointerDown(item, e) : undefined}
      onPointerMove={draggable ? dragHandlers.onPointerMove : undefined}
      onPointerUp={draggable ? dragHandlers.onPointerUp : undefined}
      onPointerCancel={draggable ? dragHandlers.onPointerCancel : undefined}
    >

      {isShortlisted && (
        <div className="absolute top-1 right-1 rounded bg-rt-secondary text-white text-[10px] px-2 py-0.5">
          Shortlisted
        </div>
      )}

      {isLeader && !shortlistLocked && (
        <button
          type="button"
          onClick={() => {
  console.log("CLICKED!");
  toggleShortlist(item.id);
}}

          className={`
            absolute -top-2 -left-2 h-5 w-5 flex items-center justify-center
            rounded-full border transition-colors z-50
            ${isShortlisted
              ? "bg-rt-secondary border-rt-secondary text-white"
              : "bg-white border-rt-secondary text-rt-secondary"
            }
          `}
          style={{
            transform: "translate(-20%, -20%)",
            cursor: "pointer",
          }}
        >
          {isShortlisted && (
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
          )}
        </button>
      )}

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

          {(canEditText || canDelete) && (
            <OwnerControls
              canEditText={canEditText}
              canDelete={canDelete}
              isOwn={isOwn}
              onEdit={() => setEditing(true)}
              onDelete={() => void onDelete(item)}
            />
          )}
        </>
      )}
    </div>
  );
}
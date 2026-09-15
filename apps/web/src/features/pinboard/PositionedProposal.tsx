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
import type { BoardItem, StickyArtifact } from '@roundtable/shared';
import type { ProposalArrangeInput } from '@roundtable/shared/schemas';

import { prepareStickyText, STICKY_TEXT_LIMIT } from '../tools/artifactLimits';
import {
  STICKY_FONT_SIZE,
  STICKY_LINE_HEIGHT,
  STICKY_TOO_TALL,
  stickyFits,
  stickySize,
} from '../tools/sticky/stickyPresentation';
import { cardWidth } from './cardMetrics';
import { useNoteAutoGrow } from '../tools/sticky/useNoteAutoGrow';
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
  STICKY_SHADOW,
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
  onEditText: (item: BoardItem, text: string) => Promise<void>;
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
 * Inline text editor for a sticky you authored.
 *
 * Stickies edit here, because a sticky is one field and a full-screen editor
 * for it would be heavier than the change. Drawings and diagrams reopen in the
 * Creative Tools studio (F19–F21) instead, which is the only place their
 * shapes can be manipulated.
 *
 * The length rule is the same one the tool enforces when a sticky is written,
 * and comes from the same place. Editing used to stop only at the schema's
 * outer bound, so a note capped at the tool's limit on the way in could be
 * grown to 2000 characters immediately afterwards, on a card the size of a
 * postcard.
 */
function StickyTextEditor({
  artifact,
  onSave,
  onCancel,
}: {
  artifact: StickyArtifact;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(artifact.text);
  const size = stickySize(text);
  const [paperFull, setPaperFull] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const theme = STICKY_THEMES[artifact.color];

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const noteFull = text.length >= STICKY_TEXT_LIMIT || paperFull;
  // Whitespace counts as a change: adding a blank line is an edit like any other.
  const unchanged = text === artifact.text;
  const prepared = prepareStickyText(text);
  // Checked as well as the count, for a note that arrived already too tall for
  // any sticky: typing cannot make one, but it can open like that.
  const tooTall = prepared.ok && !stickyFits(text);
  const submittable = !saving && !unchanged && prepared.ok && !tooTall;
  /**
   * Shown as soon as it is true, not on a press.
   *
   * Save is disabled while the note is too long, so a message that waited for
   * a click would wait for one that cannot land. Typing cannot get you here —
   * the field stops at the limit — but a note written before the limit
   * existed, or through another client, opens over it.
   */
  const tooLong =
    !prepared.ok && text.length > STICKY_TEXT_LIMIT
      ? prepared.error
      : tooTall
        ? STICKY_TOO_TALL
        : null;

  // The editor grows with the note for the same reason the card does, and
  // raises its floor rather than setting its height: the paper around it is a
  // flex column that already stretches this to fill a short note's square.
  useNoteAutoGrow(ref, text, 'minHeight');

  const submit = () => {
    if (!submittable) return;
    setSaving(true);
    void onSave(text)
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
        // Sized from the text as it is typed, by the same ladder the board
        // card uses, so a note that will land bigger grows while you write it
        // rather than jumping when you save.
        width: size,
        minHeight: size,
        borderRadius: STICKY_RADIUS,
        background: theme.bg,
        boxShadow: STICKY_SHADOW,
      }}
    >
      <textarea
        ref={ref}
        value={text}
        maxLength={STICKY_TEXT_LIMIT}
        onChange={(e) => {
          const next = e.target.value;
          // The same refusal the tool makes while a sticky is written: a note
          // is not allowed to outgrow the largest square by being rewritten.
          if (next.length > text.length && !stickyFits(next)) {
            // Full once what was typed will not go in. A line break is the
            // exception: the sticky can run out of lines while the last line
            // still has room for words, and then the note is not full, the
            // Enter just does not happen.
            const onlyLineBreaks = next.replace(/\n/g, '') === text.replace(/\n/g, '');
            setPaperFull(onlyLineBreaks ? !stickyFits(`${text}a`) : true);
            return;
          }
          // Still full after trailing spaces go in: they take no room, so
          // the note is no less full for them. Anything else changes what the
          // paper holds, and the next refusal will say so if it is still full.
          if (next.trim() !== text.trim()) setPaperFull(false);
          setText(next);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          // Enter saves, Shift+Enter adds a line — the usual bargain for a
          // one-field editor people use dozens of times in a session.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="min-h-0 flex-1 resize-none overflow-hidden bg-transparent outline-none transition-[min-height] duration-150 ease-out motion-reduce:transition-none"
        style={{
          padding: '14px 14px 6px',
          fontSize: STICKY_FONT_SIZE,
          fontWeight: 500,
          lineHeight: STICKY_LINE_HEIGHT,
          color: CARD_INK,
        }}
        aria-label="Edit sticky note text"
      />
      {tooLong ? (
        <p role="alert" className="px-3 pb-1 text-[10.5px] leading-snug text-rt-secondary-deep">
          {tooLong}
        </p>
      ) : null}

      {/* The same height as the card's byline, so a note has exactly the room
          while it is edited that it will have on the board, and the editor
          stays the square the card is. */}
      <div className="flex items-center gap-2 px-3 pb-2">
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
            the ceiling does not appear to move between writing and editing.
            Every character counts, spaces at either end included: the box
            itself stops at that many, so a count that skipped them could read
            short of the limit while refusing the next keystroke. And like the
            tool, it reads "Full" once nothing more will go in, whichever
            limit stopped it. */}
        <span
          aria-live="polite"
          className={`ml-auto text-[10px] tabular-nums ${
            noteFull ? 'font-semibold text-rt-secondary-deep' : 'text-rt-ink-faint'
          }`}
        >
          {noteFull ? 'Full' : `${text.length}/${STICKY_TEXT_LIMIT}`}
        </span>
      </div>
    </div>
  );
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
  onEditText,
  onDelete,
  onArrange,
  onCopyText,
  viewerId,
  onReact,
  isShortlisted,
  canToggleShortlist,
  onToggleShortlist,
}: PositionedProposalProps) {
  const [editing, setEditing] = useState(false);
  // Removal is destructive and cannot be undone, so it always passes through a
  // confirmation (F17) — for the author and the moderating leader alike.
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Paper or panel: the difference decides the corner every highlight follows.
  const isSticky = item.artifactJson.type === 'sticky';
  // The shortlist outline is a 2px ring, so its stroke runs 1px outside the
  // card and the marker that sits on it follows the card's own corner.
  const markerOffset = cornerPoint(isSticky ? STICKY_RADIUS_PX : CARD_RADIUS_PX, 1);
  // A sticky is edited in place — it is one field, and a full-screen editor for
  // it would be heavier than the change. Anything else reopens in the tool that
  // made it, which is the only place its shape can be manipulated.
  const editsInline = isOwn && isSticky;
  const canEdit = isOwn && boardOpen && (editsInline || onOpenEditor !== undefined);
  const draggable = canMove && !editing;

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
              onSelect: () => (editsInline ? setEditing(true) : onOpenEditor?.(item)),
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
        // The shared stack at rest. A card being dragged, showing its menu, or
        // being edited is lifted clear of every card instead, so what you are
        // working on is never under something else.
        zIndex: isDragging
          ? stackSize + 3
          : menu
            ? stackSize + 2
            : editing
              ? stackSize + 1
              : stackIndex + 1,
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
        // The browser's own menu wherever ours has nothing to offer, and inside
        // the note editor, where paste and spellcheck live.
        if (editing || !hasActions) return;
        if ((event.target as HTMLElement).closest('textarea, input')) return;
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

      {editing && item.artifactJson.type === 'sticky' ? (
        <StickyTextEditor
          artifact={item.artifactJson}
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
      )}

      {menu && !editing ? (
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

import { forwardRef, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X, type LucideIcon } from 'lucide-react';
import type { BoardItem } from '@roundtable/shared';

import { boardPopupRoom, CENTRED_ON_WINDOW, EDGE_PX, type BoardPopupRoom } from './boardPopup';
import {
  CARD_BORDER,
  CARD_INK,
  CARD_RADIUS,
  REACTION_HOVER_FILL,
  REACTION_ON_BORDER,
  THUMB_BACKGROUND,
} from './pinboardTokens';

/** As wide as it opens, where the board has the room for it. */
const MAX_WIDTH_PX = 780;
/**
 * The shape it always opens in, which is the card's own plate.
 *
 * One frame for every proposal, whatever shape its canvas is. The artwork is
 * scaled to fit whatever frame it is given, so taking each canvas's own shape
 * bought little more than trimmed margins, and cost a popup that changed size
 * and shape with every proposal opened — worst of all while voting, where the
 * point is to compare one against the next.
 */
const FRAME_ASPECT = 4 / 3;
/** The narrowest it goes before it stops shrinking and lets the artwork letterbox. */
const MIN_WIDTH_PX = 280;
/** About what the byline under the artwork takes, which is not room for the artwork. */
const BYLINE_PX = 30;

/**
 * How large it opens, and where: as large as the board has room for,
 * in the one frame every proposal opens in.
 */
function panelStyle(room: BoardPopupRoom | null): CSSProperties {
  const maxWidth = Math.min(MAX_WIDTH_PX, room?.maxWidth ?? window.innerWidth - EDGE_PX * 2);
  const maxHeight = room?.maxHeight ?? window.innerHeight - EDGE_PX * 2;
  const width = Math.max(MIN_WIDTH_PX, Math.min(maxWidth, (maxHeight - BYLINE_PX) * FRAME_ASPECT));
  return {
    ...(room
      ? {
          left: room.left,
          top: room.top,
          right: 'auto',
          bottom: 'auto',
          transform: 'translate(-50%, -50%)',
        }
      : CENTRED_ON_WINDOW),
    width,
    maxHeight,
  };
}

/**
 * How much closer a press takes you: enough to read a label written for a
 * canvas, and little enough that what you were looking at is still around it.
 */
const ZOOM = 2.2;
/** Movement past which a press is a drag rather than a press. */
const DRAG_SLOP_PX = 4;

/**
 * Keeps the artwork from being dragged out of its own frame, on whole pixels:
 * artwork drawn on half a pixel is artwork drawn blurred.
 */
function withinFrame(pan: { x: number; y: number }, frame: DOMRect) {
  const room = { x: (frame.width * (ZOOM - 1)) / 2, y: (frame.height * (ZOOM - 1)) / 2 };
  return {
    x: Math.round(Math.max(-room.x, Math.min(room.x, pan.x))),
    y: Math.round(Math.max(-room.y, Math.min(room.y, pan.y))),
  };
}

/**
 * The mark for enlarging: the expand arrows, mirrored so they open along the
 * corner the card's button sits in rather than across it.
 *
 * One piece, so the card's button, the ballot's and the board menu's row all
 * show the same mark rather than two versions of the same idea.
 */
export const EnlargeIcon: LucideIcon = forwardRef(function EnlargeIcon(
  { className, ...props },
  ref,
) {
  return <Maximize2 ref={ref} {...props} className={`-scale-x-100 ${className ?? ''}`} />;
});

/** What it calls the thing it is showing. */
const KIND: Record<BoardItem['type'], string> = {
  sticky: 'sticky note',
  drawing: 'drawing',
  diagram: 'diagram',
};

/**
 * A canvas shown at the size it was drawn at.
 *
 * A studio card gives a whole canvas a plate the width of a card: readable as a
 * glance at what somebody proposed, too small to read the labels on. Rather
 * than making cards bigger — which costs every other card on the board room —
 * the artwork opens over the board, as large as the window allows, and closes
 * again. Nothing in here can be changed: it is the card's own drawing, bigger.
 *
 * Portalled to the page rather than drawn in the card, because the board is
 * zoomed and panned: inside the card the enlarged view would be scaled with it, and
 * clipped by the card's own edges.
 */
export function ProposalEnlarge({
  item,
  artwork,
  byline,
  placement = 'corner',
  open: openFromOutside,
  onOpenChange,
}: {
  item: BoardItem;
  /** The card's own drawing, drawn again in the enlarged view's frame. */
  artwork: ReactNode;
  /** The card's byline, so the enlarged view says whose proposal this is. */
  byline: ReactNode;
  /**
   * Whether it is open, where something else opens it too — the board's actions
   * menu. Left out, this button is the only way in and keeps the state itself.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Where the way in sits: in the corner of the card's plate, or beside the
   * card as its own row, for a ballot where the card is itself a button and
   * can hold nothing that is pressed on its own.
   */
  placement?: 'corner' | 'beside';
}) {
  const [openHere, setOpenHere] = useState(false);
  const open = openFromOutside ?? openHere;
  const setOpen = (next: boolean) => {
    setOpenHere(next);
    onOpenChange?.(next);
  };
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Focus comes back to the way in once it is closed, whichever way it
  // was opened, and only once that button is on screen again.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) buttonRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      {/* Gone while the canvas is open: it is behind what it opened, and
          pressing it again would do nothing. */}
      <button
        hidden={open}
        ref={buttonRef}
        type="button"
        title={`Enlarge ${KIND[item.type]}`}
        aria-label={`Enlarge ${KIND[item.type]} by ${item.authorName}`}
        // Its own press, not the card's: a card is dragged from anywhere on it,
        // and pressed to shortlist it.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className={
          placement === 'corner'
            ? 'absolute right-2 bottom-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-rt-tertiary bg-white/90 text-rt-ink-muted opacity-0 shadow-sm transition-[opacity,background-color,border-color,color] group-focus-within/card:opacity-100 group-hover/card:opacity-100 hover:border-(--rt-control-edge) hover:bg-(--rt-control-fill) hover:text-(--rt-control-ink) focus-visible:opacity-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary [@media(hover:none)]:opacity-100'
            : // Beside the card, where it is a row of its own rather than a mark
              // on the artwork, so it is there to be read as well as pressed.
              'inline-flex items-center gap-1.5 rounded-full border border-rt-tertiary bg-white px-2.5 py-1 text-[11px] font-semibold text-rt-ink-muted shadow-sm transition-colors hover:border-(--rt-control-edge) hover:bg-(--rt-control-fill) hover:text-(--rt-control-ink) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-primary'
        }
        style={
          {
            // The slate the card's other controls hover to, so they read as one
            // family. A hover colour cannot be an inline style, hence the
            // variables.
            '--rt-control-fill': REACTION_HOVER_FILL,
            '--rt-control-edge': REACTION_ON_BORDER,
            '--rt-control-ink': CARD_INK,
          } as React.CSSProperties
        }
      >
        <EnlargeIcon aria-hidden="true" size={12} strokeWidth={2.2} />
        {placement === 'beside' ? 'Enlarge' : null}
      </button>
      {open ? (
        <EnlargedView
          item={item}
          artwork={artwork}
          byline={byline}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function EnlargedView({
  item,
  artwork,
  byline,
  onClose,
}: {
  item: BoardItem;
  artwork: ReactNode;
  byline: ReactNode;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // In the middle of the board, over the cards it was opened from, as large as
  // the board has room for.
  const [style, setStyle] = useState(() => panelStyle(boardPopupRoom()));
  useEffect(() => {
    const onResize = () => setStyle(panelStyle(boardPopupRoom()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /**
   * How close the artwork is, and where it has been dragged to.
   *
   * A press on the artwork takes you in at the spot you pressed, so the thing
   * you wanted a better look at is what you get. In close, a drag moves the
   * canvas under the frame and a press takes you back out. Only two steps: a
   * canvas is not a map, and anything more needs a zoom control, which is a
   * reason to open the studio rather than to look at a card.
   */
  const frameRef = useRef<HTMLDivElement>(null);
  const [close, setClose] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    pan: { x: number; y: number };
    moved: boolean;
  } | null>(null);

  /** Takes the artwork in at a point of the frame, or back out again. */
  const toggleClose = (at?: { x: number; y: number }) => {
    const frame = frameRef.current?.getBoundingClientRect();
    if (close || !frame) {
      setClose(false);
      setPan({ x: 0, y: 0 });
      return;
    }
    const from = at ?? { x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 };
    // The point pressed stays where it is as everything around it grows.
    setPan(
      withinFrame(
        {
          x: -(from.x - frame.left - frame.width / 2) * (ZOOM - 1),
          y: -(from.y - frame.top - frame.height / 2) * (ZOOM - 1),
        },
        frame,
      ),
    );
    setClose(true);
  };

  useEffect(() => {
    panelRef.current?.focus();
    // Escape closes it wherever the focus has gone.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    /**
     * A press anywhere else puts it away, and still does whatever it was a
     * press on — another card, the toolbar, the board itself — the way the
     * board's other popovers behave. Listened for on the way down, so the
     * canvas is gone before a drag that starts outside it gets going.
     */
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      closeRef.current();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, []);

  return createPortal(
    // Nothing behind it is dimmed or locked: the board is still there to look
    // at and to press, so glancing at a canvas costs nothing.
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`${KIND[item.type]} by ${item.authorName}`}
      tabIndex={-1}
      className="rt-enlarge-open fixed z-50 flex flex-col overflow-hidden border bg-rt-surface shadow-[0_10px_28px_rgba(8,12,21,0.16)] outline-none"
      style={{ ...style, borderColor: CARD_BORDER, borderRadius: CARD_RADIUS }}
      /**
       * Nothing pressed in here reaches the card it was opened from. This is
       * drawn on the page, but React carries its events up the tree it belongs
       * to, which runs through that card: without this, a press on the canvas
       * picked the card up behind it and took the pointer with it, so a press
       * never finished and the zoom never happened.
       */
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <>
        {/* The artwork takes whatever the board leaves, in the one frame every
            proposal opens in, and moves within it once it is taken in close. */}
        <div
          ref={frameRef}
          role="button"
          tabIndex={0}
          aria-label={close ? 'Zoom out' : 'Zoom in'}
          // Nothing in here is text to be picked up: a press zooms, and a drag
          // moves the canvas. Without this, dragging highlighted the labels
          // drawn on the canvas as though they were being selected to copy.
          className="relative min-h-0 flex-1 overflow-hidden select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-ink"
          style={{
            background: THUMB_BACKGROUND,
            aspectRatio: FRAME_ASPECT,
            // The magnifier says what a press does — in, then out again —
            // whether or not the canvas is being dragged under it.
            cursor: close ? 'zoom-out' : 'zoom-in',
            // The drag is the frame's, not the browser's idea of a scroll.
            touchAction: 'none',
          }}
          onPointerDown={(event) => {
            // The left button zooms and drags. A right press belongs to the
            // menu it opens, and a middle one to the board's own panning.
            if (event.button !== 0) return;
            // Capture keeps a drag that wanders off the frame coming back here,
            // where it is available: a synthesised press has no pointer to
            // capture, and losing the press with it would cost the zoom itself.
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Nothing to capture; the frame's own handlers still see the drag.
            }
            drag.current = { x: event.clientX, y: event.clientY, pan, moved: false };
          }}
          onPointerMove={(event) => {
            const held = drag.current;
            const frame = frameRef.current?.getBoundingClientRect();
            if (!held || !close || !frame) return;
            const moved = {
              x: event.clientX - held.x,
              y: event.clientY - held.y,
            };
            if (!held.moved && Math.hypot(moved.x, moved.y) < DRAG_SLOP_PX) return;
            held.moved = true;
            setDragging(true);
            setPan(withinFrame({ x: held.pan.x + moved.x, y: held.pan.y + moved.y }, frame));
          }}
          onPointerUp={(event) => {
            if (event.button !== 0) return;
            const held = drag.current;
            drag.current = null;
            setDragging(false);
            // A press that went nowhere is a press, not a drag.
            if (held && !held.moved) toggleClose({ x: event.clientX, y: event.clientY });
          }}
          // A canvas is not artwork to be dragged out of the page either.
          onDragStart={(event) => event.preventDefault()}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          // Only a keyboard press lands here with no pointer behind it; a mouse
          // press is already dealt with above, and would otherwise count twice.
          onClick={(event) => {
            if (event.detail === 0) toggleClose();
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggleClose();
          }}
        >
          <div
            className={`absolute inset-0 ${
              dragging
                ? ''
                : 'transition-transform duration-150 ease-out motion-reduce:transition-none'
            }`}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${close ? ZOOM : 1})`,
            }}
          >
            {artwork}
          </div>
          {/* In the corner the artwork leaves clear, where a window's close is:
              on the plate rather than beside the byline, which is about the
              proposal rather than about this view. */}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-rt-tertiary bg-white/90 text-rt-ink-muted shadow-sm transition-colors hover:bg-rt-surface-alt hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-ink focus-visible:outline-none"
          >
            <X aria-hidden="true" size={15} strokeWidth={2.2} />
          </button>
        </div>
        <div className="border-t" style={{ borderColor: CARD_BORDER }}>
          {byline}
        </div>
      </>
    </div>,
    document.body,
  );
}

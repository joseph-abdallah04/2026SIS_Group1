import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import type { BoardItem } from '@roundtable/shared';

import {
  CARD_BORDER,
  CARD_INK,
  CARD_RADIUS,
  REACTION_HOVER_FILL,
  REACTION_ON_BORDER,
  THUMB_BACKGROUND,
} from './pinboardTokens';

/** What the preview calls the thing it is showing. */
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
 * zoomed and panned: inside the card the preview would be scaled with it, and
 * clipped by the card's own edges.
 */
export function ProposalPreview({
  item,
  artwork,
  byline,
}: {
  item: BoardItem;
  /** The card's own drawing, drawn again in the preview's frame. */
  artwork: ReactNode;
  /** The card's byline, so the preview says whose proposal this is. */
  byline: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title={`Preview ${KIND[item.type]}`}
        aria-label={`Preview ${KIND[item.type]} by ${item.authorName}`}
        // Its own press, not the card's: a card is dragged from anywhere on it,
        // and pressed to shortlist it.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className="absolute right-2 bottom-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-rt-tertiary bg-white/90 text-rt-ink-muted opacity-0 shadow-sm transition-[opacity,background-color,border-color,color] group-focus-within/card:opacity-100 group-hover/card:opacity-100 hover:border-(--rt-control-edge) hover:bg-(--rt-control-fill) hover:text-(--rt-control-ink) focus-visible:opacity-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary [@media(hover:none)]:opacity-100"
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
        <Maximize2 aria-hidden="true" size={12} strokeWidth={2.2} />
      </button>
      {open ? (
        <PreviewDialog
          item={item}
          artwork={artwork}
          byline={byline}
          onClose={() => {
            setOpen(false);
            buttonRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

function PreviewDialog({
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

  useEffect(() => {
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape closes it wherever the focus has gone, and a press anywhere off
      // the artwork does too, as the board's other popovers do.
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      // The board behind the preview is covered and cannot be pressed, so Tab
      // does not wander off into it either: it stays on the way out of here.
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      const stops = panel?.querySelectorAll<HTMLElement>('button, [href], [tabindex="0"]');
      if (!panel || !stops?.length) return;
      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const active = document.activeElement;
      if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return createPortal(
    <div
      className="rt-studio-fade fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(8, 12, 21, 0.28)' }}
      // The board behind it is not the subject any more; a press out here puts
      // the preview away rather than reaching the card underneath.
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${KIND[item.type]} by ${item.authorName}`}
        tabIndex={-1}
        className="rt-sticky-popup-rise flex max-h-full w-[min(92vw,1100px)] flex-col overflow-hidden border bg-rt-surface shadow-[0_18px_48px_rgba(8,12,21,0.28)] outline-none"
        style={{ borderColor: CARD_BORDER, borderRadius: CARD_RADIUS }}
      >
        {/* The artwork takes whatever the window leaves, keeping its own shape
            within it, so a wide canvas is wide and a tall one is tall. */}
        <div
          className="relative min-h-0 flex-1 overflow-hidden"
          style={{ background: THUMB_BACKGROUND, aspectRatio: '4 / 3' }}
        >
          {artwork}
          {/* In the corner the artwork leaves clear, where a window's close is:
              on the plate rather than beside the byline, which is about the
              proposal rather than about this preview. */}
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-rt-tertiary bg-white/90 text-rt-ink-muted shadow-sm transition-colors hover:bg-rt-surface-alt hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-ink focus-visible:outline-none"
          >
            <X aria-hidden="true" size={15} strokeWidth={2.2} />
          </button>
        </div>
        <div className="border-t" style={{ borderColor: CARD_BORDER }}>
          {byline}
        </div>
      </div>
    </div>,
    document.body,
  );
}

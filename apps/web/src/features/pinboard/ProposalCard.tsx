import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { type BoardItem } from '@roundtable/shared';

import { StudioArtwork } from '../tools/studio/StudioArtwork';

import {
  STICKY_FONT_SIZE,
  STICKY_LINE_HEIGHT,
  STICKY_NOTE_CLASS,
  STICKY_NOTE_PADDING,
} from '../tools/sticky/stickyPresentation';
import { canShowImage } from '../tools/image/canShowImage';
import { StickyText } from '../tools/sticky/StickyText';
import { useCardTooltip } from './useCardTooltip';
import { hasArtwork } from './hasArtwork';
import { ProposalEnlarge } from './ProposalEnlarge';
import { exportFormats, type ExportFormat } from './proposalExport';
import { cardWidth } from './cardMetrics';
import {
  CARD_BORDER,
  CARD_FOOT_CLASS,
  CARD_RADIUS,
  CARD_SHADOW,
  OWNED_INK,
  STICKY_RADIUS,
  STICKY_SHADOW,
  STICKY_THEMES,
  THUMB_BACKGROUND,
} from './pinboardTokens';

interface ProposalCardProps {
  item: BoardItem;
  /** Who is looking, so an extension of their own idea can say "your". */
  viewerId?: string | null;
  /** The viewer wrote this: show "You" as the author name. */
  isOwnedByViewer?: boolean;
  /** The author runs this session, marked with an L beside their name. */
  isAuthorLeader?: boolean;
  /** Arrived on a live broadcast just now, so it gets a one-off highlight (F15). */
  isNew?: boolean;
  /** On the leader's voting shortlist (F27). */
  isShortlisted?: boolean;
  /**
   * Whether the card may hold presses of its own: a sticky's links. Off where
   * the card is itself a button, as on a ballot, where links are drawn without
   * being links.
   */
  interactive?: boolean;
  /**
   * Whether the preview is open, where something outside the card opens it too
   * — the board's actions menu. Left out, the card's own button is the only way
   * in and keeps the state itself.
   */
  enlargedOpen?: boolean;
  onEnlargedOpenChange?: (open: boolean) => void;
  /**
   * Whether a press on the artwork opens it. Off while the board is being
   * shortlisted, where a press on a card is how a card is picked.
   */
  openOnArtworkPress?: boolean;
  /**
   * Save this card's artwork as a file, from the enlarged view. Left out where
   * there is nowhere to say how it went — a ballot, the landing page — and the
   * view then offers no export.
   */
  onExport?: (item: BoardItem, format: ExportFormat) => void;
}

/** The plate every card gives artwork, so a row of cards lines up. */
const PLATE_ASPECT = 4 / 3;

export { hasArtwork };

/** Clock time only. A board is one sitting, so the date is never in doubt. */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * A small word in the byline that explains itself on hover.
 *
 * The explanation also goes to screen readers as ordinary text, since a mark is
 * not something anyone tabs to, and a tooltip is not something a screen reader
 * hovers.
 */
function FootMark({ tooltip, children }: { tooltip: string; children: ReactNode }) {
  const explanation = useCardTooltip<HTMLSpanElement>(tooltip);

  return (
    <span data-foot-mark className="shrink-0 text-[10px]" {...explanation.anchor}>
      <span aria-hidden="true">{children}</span>
      <span className="sr-only">{tooltip}</span>
      {explanation.tooltip}
    </span>
  );
}

/**
 * The least room, in pixels, the byline keeps between its two sides before
 * "Extended" gives way to "Ext.".
 *
 * Shortened while there is still a clear gap rather than at the moment the two
 * sides touch: a byline squeezed to its last pixel reads as crowded well before
 * anything actually overlaps, and cards on the same board flipping at slightly
 * different widths would look arbitrary.
 */
const FOOT_MIN_GAP_PX = 20;

/**
 * Who wrote this and when, along the bottom of the card: author left, time
 * pushed to the right edge, and "edited" after it once the words have changed.
 *
 * An extension is marked beside the author, not beside the time. "Extended"
 * says where the idea came from, which belongs with who wrote it, and keeping
 * it apart from "Edited" stops the right-hand side becoming a row of labels on
 * a card that is both. Where the full word would crowd the byline, it becomes
 * "Ext."; hovering either explains whose idea it builds on.
 *
 * The mark is about the content, not the row: dragging a card across the board
 * leaves no trace on it, because nothing anyone reads has changed. Hovering
 * gives the time of the edit, which is the question the mark prompts and the
 * only reason to keep the timestamp of the original beside it.
 *
 * The bottom inset matches the sides at twelve pixels, so the byline sits in
 * an evenly spaced corner. That also happens to be exactly what the reaction
 * chips need: the board draws them straddling this card's bottom-left corner,
 * reaching ten pixels up into it, so an even inset clears them and nothing has
 * to move.
 *
 * One fixed value rather than one that grows with the reactions. A card that
 * resized as chips came and went drew the eye to its own edges instead of to
 * what somebody had written on it.
 */
export function CardFoot({
  item,
  viewerId,
  isOwnedByViewer,
  isAuthorLeader,
}: {
  item: BoardItem;
  viewerId: string | null;
  isOwnedByViewer: boolean;
  isAuthorLeader: boolean;
}) {
  const original = item.extendsFrom;
  // Hovering names whose idea it was, which is the question the mark prompts.
  const extendedTooltip = original
    ? original.authorId !== null && original.authorId === viewerId
      ? 'Extended: builds on your idea'
      : `Extended: builds on ${original.authorName}'s idea`
    : null;

  const footRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const metaRef = useRef<HTMLSpanElement>(null);
  const fullMarkRef = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);
  const authorLabel = isOwnedByViewer ? 'You' : item.authorName;

  /**
   * Whether "Extended" fits with room to spare, measured on the card as laid out.
   *
   * Measured rather than estimated from character counts: names and times are
   * set in a proportional face, and a card's width depends on what a sticky
   * says. The full word is kept in an invisible copy so the decision is always
   * made against it, not against whichever label happens to be showing — which
   * would flip back and forth. Widths are layout widths, untouched by the board's
   * zoom, so zooming never changes the choice.
   */
  useLayoutEffect(() => {
    if (!extendedTooltip) return;
    const foot = footRef.current;
    const name = nameRef.current;
    const meta = metaRef.current;
    const fullMark = fullMarkRef.current;
    if (!foot || !name || !meta || !fullMark) return;

    const measure = () => {
      const style = getComputedStyle(foot);
      const inner =
        foot.clientWidth -
        parseFloat(style.paddingLeft || '0') -
        parseFloat(style.paddingRight || '0');
      // No layout to measure (a hidden card, or a test environment): keep the word.
      if (inner <= 0) {
        setCompact(false);
        return;
      }
      // The name at its natural width, even while truncated, plus the mark and
      // the gap the left group puts between them.
      const leftGap =
        parseFloat(getComputedStyle(name.parentElement ?? name).columnGap || '0') || 0;
      const needed = name.scrollWidth + leftGap + fullMark.offsetWidth + meta.offsetWidth;
      setCompact(inner - needed < FOOT_MIN_GAP_PX);
    };

    measure();
    // A sticky's card grows with its note, and the page's font can arrive after
    // the first layout; either changes what fits.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(foot);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) measure();
    });
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [extendedTooltip, authorLabel, isAuthorLeader, item.createdAt, item.editedAt]);

  return (
    <footer ref={footRef} className={CARD_FOOT_CLASS}>
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span ref={nameRef} className="min-w-0 truncate font-medium text-rt-ink-muted">
          {authorLabel}
          {/* Never beside "You": the mark is there to say whose cards belong to the
              leader, and the viewer does not need telling who they are. */}
          {isAuthorLeader && !isOwnedByViewer ? (
            <span title="Session leader" className="ml-1 text-[9.5px]" style={{ color: OWNED_INK }}>
              L
            </span>
          ) : null}
        </span>
        {/* A quiet note about where the idea came from, not a badge competing
            with what is written on the card. The name gives way first: the
            mark never truncates. Reuses of your own earlier idea carry no mark
            (the server leaves `extendsFrom` empty for them). */}
        {extendedTooltip ? (
          <>
            <FootMark tooltip={extendedTooltip}>{compact ? 'Ext.' : 'Extended'}</FootMark>
            {/* The full word, laid out but never seen, to measure against. */}
            <span
              ref={fullMarkRef}
              aria-hidden="true"
              className="pointer-events-none invisible absolute text-[10px] whitespace-nowrap"
            >
              Extended
            </span>
          </>
        ) : null}
      </span>
      <span ref={metaRef} className="flex shrink-0 items-baseline gap-1.5">
        <time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>
        {item.editedAt ? (
          // Set a little smaller than the time rather than run on after it
          // with a separator: that difference is enough to keep the two apart,
          // and the mark should sit quietly beside the byline rather than
          // compete with it.
          <FootMark tooltip={`Edited at ${formatTime(item.editedAt)}`}>Edited</FootMark>
        ) : null}
      </span>
    </footer>
  );
}

/**
 * The plate a drawing or a diagram is shown on.
 *
 * Full width across the top of the card, not a panel floating inside one. An
 * inset plate within a bordered card puts two frames around the same artwork,
 * and the card then reads as a box with a picture in it rather than a picture
 * with a byline underneath. The card's own `overflow-hidden` rounds the top
 * corners for it.
 *
 * A fixed four-by-three area rather than one that follows the content, so a
 * row of cards lines up and a sparse diagram does not sit in a box a third the
 * height of its neighbour's.
 */
function CardMedia({
  children,
  onOpen,
}: {
  children: ReactNode;
  /**
   * Opens the artwork at a size it can be read at. The whole plate is the way
   * in, not only the small mark in its corner: the drawing is what somebody
   * wants a closer look at, so the drawing is what they press.
   */
  onOpen?: (event: React.MouseEvent) => void;
}) {
  return (
    <div
      // Named, so the board can tell a press that began on the artwork from one
      // that began anywhere else on the card.
      data-card-plate
      // A hand, not a magnifier: on the board this is a card to be opened. The
      // magnifier belongs inside, where a press really does zoom.
      className={`relative w-full overflow-hidden border-b ${onOpen ? 'cursor-pointer' : ''}`}
      style={{ aspectRatio: PLATE_ASPECT, background: THUMB_BACKGROUND, borderColor: CARD_BORDER }}
      onClick={onOpen}
    >
      {children}
    </div>
  );
}

/**
 * A proposal's drawing: a studio canvas, or a drawing's image.
 *
 * Drawn into whatever box it is given, so the card's plate and the preview's
 * frame show the same artwork. Null for a sticky, whose words are not artwork,
 * and for a drawing proposed before strokes were stored, which has none.
 */
export function ProposalArtwork({ item }: { item: BoardItem }) {
  const artifact = item.artifactJson;
  if (artifact.type === 'diagram') return <StudioArtwork scene={artifact} />;
  if (artifact.type === 'image') {
    // Only ever a data URL this build has checked. An address here would have
    // every viewer's browser fetch from wherever a proposal pointed it.
    if (!canShowImage(artifact.src)) return null;
    return (
      // Mounted on the plate rather than run to its edges, inset as far as a
      // drawing is, so a wide picture, a tall one and a panorama all sit in
      // the card the same way rather than some touching its sides and some not.
      <div className="absolute inset-0 flex items-center justify-center p-2.5">
        <img
          src={artifact.src}
          alt={`Image by ${item.authorName}`}
          width={artifact.width}
          height={artifact.height}
          // Kept whole and letterboxed rather than cropped to the plate: the
          // author already chose the framing when they imported it, and a card
          // that trimmed it again would be showing something they did not pick.
          // Sized by its own box, not an object-fit inside a bigger one, so the
          // rounding lands on the picture's corners: shrunk to fit but never
          // enlarged past its own size, so a small icon stays crisp rather than
          // blown up into a blur. Rounded here and never in the crop, where the
          // corners are the exact cut being made.
          className="h-auto max-h-full min-h-0 w-auto max-w-full min-w-0 rounded-md"
          loading="lazy"
          decoding="async"
          // Images are natively draggable, which would hijack a card drag.
          draggable={false}
        />
      </div>
    );
  }
  if (artifact.type !== 'drawing') return null;
  // Never inject a peer's SVG into this document: it is arbitrary user-authored
  // markup, so an inline <svg> would run any <script>/onload it carries in every
  // viewer's session. An <img> renders SVG with scripting and external fetches
  // disabled, so a hostile drawing is inert.
  const svg = artifact.svg.trim();
  if (!svg) return null;
  return (
    <img
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
      alt={`Drawing by ${item.authorName}`}
      loading="lazy"
      // Images are natively draggable, which would hijack a card drag.
      draggable={false}
      className="absolute inset-0 h-full w-full object-contain p-2.5"
    />
  );
}

export function ProposalCard({
  item,
  viewerId = null,
  isOwnedByViewer = false,
  isAuthorLeader = false,
  isNew = false,
  isShortlisted = false,
  interactive = true,
  enlargedOpen,
  onEnlargedOpenChange,
  openOnArtworkPress = true,
  onExport,
}: ProposalCardProps) {
  const artifact = item.artifactJson;
  const isSticky = artifact.type === 'sticky';
  const size = cardWidth(item);
  // A sticky keeps the colour its author chose, in its own matching edge.
  const theme = isSticky ? STICKY_THEMES[artifact.color] : null;

  // Never inject a peer's SVG into this document: it is arbitrary user-authored
  // markup, so an inline <svg> would run any <script>/onload it carries in every
  // viewer's session. An <img> renders SVG with scripting and external fetches
  // disabled, so a hostile drawing is inert.
  const artwork = <ProposalArtwork item={item} />;
  // A drawing proposed before strokes were stored has nothing to draw, and so
  // nothing to open: the plate stays, the way into the preview does not.
  const hasPlate =
    artifact.type === 'diagram' || artifact.type === 'drawing' || artifact.type === 'image';
  const openable = hasArtwork(item);
  // Kept here, not in the button, because the plate opens it as well.
  const [openedHere, setOpenedHere] = useState(false);
  const enlarged = enlargedOpen ?? openedHere;
  const setEnlarged = (next: boolean) => {
    setOpenedHere(next);
    onEnlargedOpenChange?.(next);
  };
  /**
   * Where a press on the artwork began, so a drag across the board is not
   * taken for a press on the card: a card is dragged from anywhere on it, and
   * the plate is most of it.
   */
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const opensOnPress = interactive && openable && openOnArtworkPress;
  // The enlarged view offers the one format worth a button of its own: a PNG
  // of a canvas, or a picture as it was stored. The menu has the rest.
  const enlargedExport = onExport ? exportFormats(item)[0] : undefined;
  const foot = (
    <CardFoot
      item={item}
      viewerId={viewerId}
      isOwnedByViewer={isOwnedByViewer}
      isAuthorLeader={isAuthorLeader}
    />
  );

  return (
    // Always wrapped, highlighted or not: toggling the wrapper in and out would
    // remount the card and make drawings refetch their image mid-animation.
    <div
      className={`group/card ${isNew ? 'shrink-0 rt-proposal-arrive' : 'shrink-0'}`}
      style={{ borderRadius: isSticky ? STICKY_RADIUS : CARD_RADIUS }}
    >
      {/* A sticky is bare paper: no outline, square corners, and a square
          footprint that grows a step at a time with its note. Everything else
          is a panel, so it keeps its border and its rounded edge. */}
      <article
        onPointerDown={
          opensOnPress
            ? (event) => {
                pressedAt.current = { x: event.clientX, y: event.clientY };
              }
            : undefined
        }
        className={`flex shrink-0 flex-col overflow-hidden ${
          isSticky
            ? 'transition-[width,min-height] duration-150 ease-out motion-reduce:transition-none'
            : 'border'
        } ${isShortlisted ? 'ring-1 ring-rt-secondary/40' : ''}`}
        style={{
          width: size,
          // Square, and a floor rather than a fixed height: the step the note's
          // length picked is the size it starts at. A note longer than even the
          // largest square holds stays that wide and grows a little taller, so
          // every word of it is on the board.
          ...(isSticky ? { minHeight: size } : {}),
          borderRadius: isSticky ? STICKY_RADIUS : CARD_RADIUS,
          ...(isSticky ? {} : { borderColor: theme ? theme.border : CARD_BORDER }),
          background: theme ? theme.bg : '#FFFFFF',
          boxShadow: isSticky ? STICKY_SHADOW : CARD_SHADOW,
        }}
      >
        {artifact.type === 'sticky' ? (
          // Fills whatever the square leaves above the byline, so a short note
          // sits at the top of the paper rather than centred in it. Never
          // shrinks below the note, so a long one makes the card taller.
          <div className="flex flex-1 flex-col">
            <div
              data-sticky-note
              className={STICKY_NOTE_CLASS}
              style={{
                padding: STICKY_NOTE_PADDING,
                fontSize: STICKY_FONT_SIZE,
                lineHeight: STICKY_LINE_HEIGHT,
              }}
            >
              <StickyText note={artifact} links={interactive ? 'open' : 'inert'} />
            </div>
          </div>
        ) : null}

        {hasPlate ? (
          <CardMedia
            onOpen={
              opensOnPress
                ? (event) => {
                    // The corner mark is its own press, and already opens it.
                    if ((event.target as HTMLElement).closest('button')) return;
                    const from = pressedAt.current;
                    pressedAt.current = null;
                    // A card is dragged from anywhere on it, the plate included:
                    // a press that travelled was a drag, not a press on the card.
                    if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > 4) {
                      return;
                    }
                    // A press with a modifier picks the card out with others on
                    // the board; it opens nothing.
                    if (event.shiftKey || event.metaKey || event.ctrlKey) return;
                    setEnlarged(true);
                  }
                : undefined
            }
          >
            {artwork}
            {/* A canvas on a card is a glance at it; this opens it at a size it
                can be read at. Left off where the card is itself a button, as
                on a ballot, which has nothing to press inside it. */}
            {interactive && openable ? (
              <ProposalEnlarge
                item={item}
                artwork={artwork}
                byline={foot}
                open={enlarged}
                onOpenChange={setEnlarged}
                exportFormat={enlargedExport}
                onExport={
                  onExport && enlargedExport ? () => onExport(item, enlargedExport) : undefined
                }
              />
            ) : null}
          </CardMedia>
        ) : null}
        {foot}
      </article>
    </div>
  );
}

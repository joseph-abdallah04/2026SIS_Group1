import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  arrowGeometry,
  diagramEdgeDash,
  diagramEdgeRoutes,
  diagramEdgeStroke,
  diagramEdgeStrokeWidth,
  diagramNodeFill,
  diagramNodeLabelLayout,
  diagramNodeLabelStyle,
  diagramEdgeKey,
  diagramNodeStroke,
  diagramNodeStrokeWidth,
  effectiveDiagramNodeSize,
  inkPoints,
  pathFill,
  pathStrokeColor,
  pathStrokeWidth,
  inkRotationTransform,
  pathRotationTransform,
  pathSvgData,
  strokePathData,
  TABLE_CELL_PADDING,
  tableCellAt,
  tableCellBold,
  tableCellColor,
  tableCellFill,
  tableCellFontSize,
  tableCellLines,
  tableColCount,
  tableColumnOffsets,
  tableRowOffsets,
  tableSize,
  tableStrokeColor,
  tableStrokeWidth,
  inkStrokeColor,
  inkStrokeWidth,
  studioPaintOrder,
  type BoardItem,
} from '@roundtable/shared';

import { DiagramShapeOutline } from '../../components/ui/DiagramShapeOutline';
import { arrowTargetLookup } from '../tools/studio/studioArrowTargets';
import { StudioArrowView } from '../tools/studio/StudioArrowView';

import {
  STICKY_FONT_SIZE,
  STICKY_LINE_HEIGHT,
  STICKY_NOTE_CLASS,
  STICKY_NOTE_PADDING,
} from '../tools/sticky/stickyPresentation';
import { StickyText } from '../tools/sticky/StickyText';
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
}

/** Clock time only. A board is one sitting, so the date is never in doubt. */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** How long the pointer rests on a mark before its explanation appears. */
const MARK_TOOLTIP_DELAY_MS = 250;
/** Room a tooltip needs above its mark: its height and the gap, with a little over. */
const MARK_TOOLTIP_ROOM_PX = 32;

/**
 * A small word in the byline that explains itself on hover.
 *
 * The native `title` waits about a second and is styled by the browser, and the
 * studio's `Tooltip` is positioned inside its parent — which here is a card that
 * clips what spills out of it and is scaled with the board's zoom, so the
 * explanation would be cut off or unreadably small. This one is portalled to the
 * page and placed against the mark on screen, so it reads the same at any zoom.
 *
 * The explanation also goes to screen readers as ordinary text, since a mark is
 * not something anyone tabs to.
 */
function FootMark({ tooltip, children }: { tooltip: string; children: ReactNode }) {
  const markRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; below: boolean } | null>(null);

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setAnchor(null);
  };

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const rect = markRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Above the mark, unless that would put it off the top of the window —
      // a card near the top edge of the board — in which case below it.
      const below = rect.top < MARK_TOOLTIP_ROOM_PX;
      setAnchor({ x: rect.left + rect.width / 2, y: below ? rect.bottom : rect.top, below });
    }, MARK_TOOLTIP_DELAY_MS);
  };

  useEffect(() => {
    if (!anchor) return;
    // The board pans under a wheel, which moves the mark out from under an
    // explanation placed once.
    window.addEventListener('wheel', hide, { passive: true });
    return () => window.removeEventListener('wheel', hide);
  }, [anchor]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <span
      ref={markRef}
      data-foot-mark
      className="shrink-0 text-[10px]"
      onPointerEnter={show}
      onPointerLeave={hide}
      // Picking the card up is not reading its byline.
      onPointerDown={hide}
    >
      <span aria-hidden="true">{children}</span>
      <span className="sr-only">{tooltip}</span>
      {anchor
        ? createPortal(
            <span
              role="presentation"
              aria-hidden="true"
              className="rt-studio-fade pointer-events-none fixed z-50 rounded-md bg-rt-ink px-2 py-1 text-[11px] font-medium whitespace-nowrap text-white shadow-lg"
              data-placement={anchor.below ? 'below' : 'above'}
              style={{
                left: anchor.x,
                top: anchor.below ? anchor.y + 6 : anchor.y - 6,
                transform: anchor.below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
              }}
            >
              {tooltip}
            </span>,
            document.body,
          )
        : null}
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
function CardFoot({
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
function CardMedia({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative w-full overflow-hidden border-b"
      style={{ aspectRatio: '4 / 3', background: THUMB_BACKGROUND, borderColor: CARD_BORDER }}
    >
      {children}
    </div>
  );
}

/**
 * Full diagram preview (F21): every shape, arrow, label, size and style the
 * editor produced. Geometry, palettes, routing and outlines all come from
 * `@roundtable/shared`, so the board cannot drift from the editor.
 */
function DiagramBody({ item }: { item: BoardItem }) {
  if (item.artifactJson.type !== 'diagram') return null;
  const { nodes, edges } = item.artifactJson;
  const ink = item.artifactJson.ink ?? [];
  const paths = item.artifactJson.paths ?? [];
  const tables = item.artifactJson.tables ?? [];
  const arrows = item.artifactJson.arrows ?? [];
  // Unpacked once per render: the extent needs every point, and so does each
  // stroke's path data.
  const unpackedInk = ink.map((stroke) => ({ ...stroke, points: inkPoints(stroke) }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const inkById = new Map(unpackedInk.map((stroke) => [stroke.id, stroke]));
  const pathById = new Map(paths.map((path) => [path.id, path]));
  const tableById = new Map(tables.map((table) => [table.id, table]));
  // Resolved once: a bound arrow has to land on the same point of the same
  // shape here as it did in the editor, so both go through one lookup.
  const arrowTargets = arrowTargetLookup({ nodes, ink: unpackedInk, paths, tables });
  const arrowRoutes = new Map(
    arrows.map((arrow) => [arrow.id, arrowGeometry(arrow, arrowTargets)]),
  );
  const arrowById = new Map(arrows.map((arrow) => [arrow.id, arrow]));
  const edgeIndexByKey = new Map(edges.map((edge, index) => [diagramEdgeKey(edge), index]));
  // The card frames whatever the artifact contains, so ink counts towards the
  // extent exactly as a node does — otherwise a sketch would be cropped.
  const allInkPoints = unpackedInk.flatMap((stroke) => stroke.points);
  const allAnchors = paths.flatMap((path) => path.anchors);
  const tableCorners = tables.map((table) => ({ table, size: tableSize(table) }));
  // An arrow can reach past everything it points at, so its route counts
  // towards the extent too — otherwise a free end would be cropped off.
  const allArrowPoints = [...arrowRoutes.values()].flatMap((geometry) => geometry.points);
  const svgWidth =
    Math.max(
      ...nodes.map((node) => node.x + effectiveDiagramNodeSize(node).width),
      ...allInkPoints.map((point) => point.x),
      ...allAnchors.map((anchor) => anchor.x),
      ...tableCorners.map(({ table, size }) => table.x + size.width),
      ...allArrowPoints.map((point) => point.x),
      72,
    ) + 28;
  const svgHeight =
    Math.max(
      ...nodes.map((node) => node.y + effectiveDiagramNodeSize(node).height),
      ...allInkPoints.map((point) => point.y),
      ...allAnchors.map((anchor) => anchor.y),
      ...tableCorners.map(({ table, size }) => table.y + size.height),
      ...allArrowPoints.map((point) => point.y),
      32,
    ) + 24;
  // Proposal-scoped marker ids prevent arrows in separate diagram cards from
  // colliding; one per resolved colour keeps each arrowhead matching its line.
  const arrowId = (color: string) => `rt-arrow-${item.id}-${color.replace('#', '')}`;
  const arrowColors = [...new Set(edges.map((edge) => diagramEdgeStroke(edge)))];
  // Reciprocal pairs bow apart here exactly as they do in the editor.
  const edgeRoutes = diagramEdgeRoutes(nodes, edges);

  function renderEdge(edge: (typeof edges)[number], index: number) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    const route = edgeRoutes[index];
    if (!from || !to || !route) return null;
    const stroke = diagramEdgeStroke(edge);
    // 1.5 is this preview's own pre-v2 width, kept for unstyled arrows.
    const strokeWidth = diagramEdgeStrokeWidth(edge, 1.5);
    return (
      <g key={`${edge.from}-${edge.to}`}>
        <path
          d={route.path}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          markerEnd={`url(#${arrowId(stroke)})`}
          {...diagramEdgeDash(edge, strokeWidth)}
        />
        {edge.label ? (
          <text
            x={route.labelX}
            y={route.labelY}
            textAnchor="middle"
            fill="#5A5F68"
            stroke="#F7F7F8"
            strokeWidth={3}
            paintOrder="stroke"
            style={{ fontSize: '9px', fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            {edge.label}
          </text>
        ) : null}
      </g>
    );
  }

  function renderPath(path: (typeof paths)[number]) {
    const strokeWidth = pathStrokeWidth(path);
    return (
      <path
        key={path.id}
        transform={pathRotationTransform(path)}
        d={pathSvgData(path)}
        fill={pathFill(path)}
        stroke={pathStrokeColor(path)}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...diagramEdgeDash(path, strokeWidth)}
      />
    );
  }

  function renderTable(table: (typeof tables)[number]) {
    const cols = tableColCount(table);
    const colOffsets = tableColumnOffsets(table);
    const rowOffsets = tableRowOffsets(table);
    const stroke = tableStrokeColor(table);
    const strokeWidth = tableStrokeWidth(table);

    return (
      <g key={table.id} transform={`translate(${table.x}, ${table.y})`}>
        {table.cells.map((_, index) => {
          const row = Math.floor(index / cols);
          const col = index % cols;
          const cell = tableCellAt(table, row, col);
          const x = colOffsets[col] ?? 0;
          const y = rowOffsets[row] ?? 0;
          const width = table.colWidths[col] ?? 0;
          const height = table.rowHeights[row] ?? 0;
          const lines = tableCellLines(table, cell, col, row);
          const fontSize = tableCellFontSize(table, cell);
          const lineHeight = fontSize * 1.25;
          const align = cell?.align ?? 'left';
          const textX =
            align === 'center'
              ? x + width / 2
              : align === 'right'
                ? x + width - TABLE_CELL_PADDING
                : x + TABLE_CELL_PADDING;

          return (
            <g key={`${table.id}-${row}-${col}`}>
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill={tableCellFill(table, cell, row)}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />
              <text
                fill={tableCellColor(cell)}
                textAnchor={align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'}
                style={{
                  fontSize: `${fontSize}px`,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontWeight: tableCellBold(table, cell, row) ? 600 : 400,
                }}
              >
                {lines.map((line, lineIndex) => (
                  <tspan
                    key={line + String(lineIndex)}
                    x={textX}
                    y={
                      y +
                      height / 2 +
                      fontSize / 3 -
                      ((lines.length - 1) * lineHeight) / 2 +
                      lineIndex * lineHeight
                    }
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  function renderInk(stroke: (typeof unpackedInk)[number]) {
    return (
      <path
        key={stroke.id}
        transform={inkRotationTransform(stroke)}
        d={strokePathData(stroke.points)}
        fill="none"
        stroke={inkStrokeColor(stroke)}
        strokeWidth={inkStrokeWidth(stroke)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  function renderNode(node: (typeof nodes)[number]) {
    const shape = node.shape ?? 'box';
    const size = effectiveDiagramNodeSize(node);
    const label = diagramNodeLabelLayout(node);
    const labelStyle = diagramNodeLabelStyle(node, size.width);

    return (
      <g
        key={node.id}
        transform={`translate(${node.x}, ${node.y})${
          node.rotation ? ` rotate(${node.rotation} ${size.width / 2} ${size.height / 2})` : ''
        }`}
      >
        <DiagramShapeOutline
          shape={shape}
          size={size}
          fill={shape === 'text' && !node.fillColor ? 'transparent' : diagramNodeFill(node)}
          // '#8CA4AC', 1 and '4 3' are this preview's own pre-v2 border.
          stroke={diagramNodeStroke(node, '#8CA4AC')}
          strokeWidth={diagramNodeStrokeWidth(node, 1)}
          containerDashArray="4 3"
        />
        <text
          textAnchor={labelStyle.anchor}
          fill={labelStyle.fill}
          style={{
            fontSize: `${label.fontSize}px`,
            fontFamily: 'Inter, system-ui, sans-serif',
            // The card has always drawn labels a shade lighter than the editor;
            // bold is the one weight both surfaces agree on exactly.
            fontWeight: node.labelBold ? labelStyle.fontWeight : shape === 'text' ? 600 : 400,
          }}
        >
          {label.lines.map((line, lineIndex) => (
            <tspan
              key={line + String(lineIndex)}
              x={labelStyle.x}
              y={label.firstBaselineY + lineIndex * label.lineHeight}
            >
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  }

  return (
    <CardMedia>
      {/* A studio canvas is empty only when it holds nothing at all — a sketch,
          a line, a table or an arrow is as much a diagram as a shape is. */}
      {nodes.length === 0 &&
      ink.length === 0 &&
      paths.length === 0 &&
      tables.length === 0 &&
      arrows.length === 0 ? (
        <div className="absolute inset-3 rounded-md border border-dashed border-rt-tertiary" />
      ) : (
        // Inset from the plate's edges so a shape at the diagram's boundary is
        // not drawn hard against the card's own edge.
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="absolute inset-0 h-full w-full p-2.5"
        >
          <defs>
            {arrowColors.map((color) => (
              <marker
                key={color}
                id={arrowId(color)}
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill={color} />
              </marker>
            ))}
          </defs>
          {/* The card paints in the artifact's own order, so a sketch sits
              above or below a shape here exactly as it did in the editor. */}
          {studioPaintOrder(item.artifactJson).map((ref) => {
            if (ref.kind === 'edge') {
              const index = edgeIndexByKey.get(ref.key);
              const edge = index === undefined ? undefined : edges[index];
              return edge && index !== undefined ? renderEdge(edge, index) : null;
            }
            if (ref.kind === 'ink') {
              const stroke = inkById.get(ref.key);
              return stroke ? renderInk(stroke) : null;
            }
            if (ref.kind === 'path') {
              const path = pathById.get(ref.key);
              return path ? renderPath(path) : null;
            }
            if (ref.kind === 'table') {
              const table = tableById.get(ref.key);
              return table ? renderTable(table) : null;
            }
            if (ref.kind === 'arrow') {
              const arrow = arrowById.get(ref.key);
              const geometry = arrowRoutes.get(ref.key);
              return arrow && geometry ? (
                <g key={arrow.id}>
                  <StudioArrowView arrow={arrow} geometry={geometry} />
                </g>
              ) : null;
            }
            const node = nodeById.get(ref.key);
            return node ? renderNode(node) : null;
          })}
        </svg>
      )}
    </CardMedia>
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
  const svg = artifact.type === 'drawing' ? artifact.svg.trim() : '';
  const drawingSrc = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;

  return (
    // Always wrapped, highlighted or not: toggling the wrapper in and out would
    // remount the card and make drawings refetch their image mid-animation.
    <div
      className={isNew ? 'shrink-0 rt-proposal-arrive' : 'shrink-0'}
      style={{ borderRadius: isSticky ? STICKY_RADIUS : CARD_RADIUS }}
    >
      {/* A sticky is bare paper: no outline, square corners, and a square
          footprint that grows a step at a time with its note. Everything else
          is a panel, so it keeps its border and its rounded edge. */}
      <article
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

        {artifact.type === 'diagram' ? <DiagramBody item={item} /> : null}

        {artifact.type === 'drawing' ? (
          <CardMedia>
            {drawingSrc ? (
              <img
                src={drawingSrc}
                alt={`Drawing by ${item.authorName}`}
                loading="lazy"
                // Images are natively draggable, which would hijack a card drag.
                draggable={false}
                className="absolute inset-0 h-full w-full object-contain p-2.5"
              />
            ) : null}
          </CardMedia>
        ) : null}
        <CardFoot
          item={item}
          viewerId={viewerId}
          isOwnedByViewer={isOwnedByViewer}
          isAuthorLeader={isAuthorLeader}
        />
      </article>
    </div>
  );
}

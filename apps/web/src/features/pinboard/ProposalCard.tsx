import {
  DIAGRAM_LABEL_INK,
  diagramEdgeDash,
  diagramEdgeRoutes,
  diagramEdgeStroke,
  diagramEdgeStrokeWidth,
  diagramNodeFill,
  diagramNodeLabelLayout,
  diagramNodeStroke,
  diagramNodeStrokeWidth,
  diagramNodesInDrawOrder,
  effectiveDiagramNodeSize,
  type BoardItem,
} from '@roundtable/shared';

import { DiagramShapeOutline } from '../../components/ui/DiagramShapeOutline';

import { stickyTypography } from '../tools/sticky/stickyPresentation';
import {
  CARD_BORDER,
  CARD_RADIUS,
  CARD_SHADOW,
  CARD_WIDTH,
  OWNED_INK,
  STICKY_RADIUS,
  STICKY_THEMES,
  THUMB_BACKGROUND,
} from './pinboardTokens';

interface ProposalCardProps {
  item: BoardItem;
  /** The viewer wrote this: show "You" as the author name. */
  isOwnedByViewer?: boolean;
  /** The author runs this session, marked with an L beside their name. */
  isAuthorLeader?: boolean;
  /** Arrived on a live broadcast just now, so it gets a one-off highlight (F15). */
  isNew?: boolean;
}

/** Clock time only. A board is one sitting, so the date is never in doubt. */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Who wrote this and when. Author on the left, time on the right — matches the
 * sticky editor's board preview so what you compose is what lands.
 */
function CardFoot({
  item,
  isOwnedByViewer,
  isAuthorLeader,
}: {
  item: BoardItem;
  isOwnedByViewer: boolean;
  isAuthorLeader: boolean;
}) {
  return (
    <footer className="flex items-center justify-between gap-2 px-3 pt-1 pb-2 text-[11px] text-rt-ink-faint">
      <span className="min-w-0 truncate font-medium text-rt-ink-muted">
        {isOwnedByViewer ? 'You' : item.authorName}
        {/* Never beside "You": the mark is there to say whose cards belong to the
            leader, and the viewer does not need telling who they are. */}
        {isAuthorLeader && !isOwnedByViewer ? (
          <span title="Session leader" className="ml-1 text-[9.5px]" style={{ color: OWNED_INK }}>
            L
          </span>
        ) : null}
      </span>
      <time dateTime={item.createdAt} className="shrink-0">
        {formatTime(item.createdAt)}
      </time>
    </footer>
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
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const svgWidth =
    Math.max(...nodes.map((node) => node.x + effectiveDiagramNodeSize(node).width), 72) + 28;
  const svgHeight =
    Math.max(...nodes.map((node) => node.y + effectiveDiagramNodeSize(node).height), 32) + 24;
  // Proposal-scoped marker ids prevent arrows in separate diagram cards from
  // colliding; one per resolved colour keeps each arrowhead matching its line.
  const arrowId = (color: string) => `rt-arrow-${item.id}-${color.replace('#', '')}`;
  const arrowColors = [...new Set(edges.map((edge) => diagramEdgeStroke(edge)))];
  // Reciprocal pairs bow apart here exactly as they do in the editor.
  const edgeRoutes = diagramEdgeRoutes(nodes, edges);

  return (
    <div
      className="mx-2.5 mt-2.5 mb-1 overflow-hidden rounded-lg bg-rt-surface-alt"
      style={{ minHeight: 96 }}
    >
      {nodes.length === 0 ? (
        <div className="m-2 flex h-20 items-center justify-center rounded-md border border-dashed border-rt-tertiary" />
      ) : (
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="h-full w-full"
          style={{ minHeight: 96 }}
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
          {edges.map((edge, index) => {
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
          })}
          {/* Containers are drawn before what they hold, so a group reads as a
              backdrop rather than covering its own contents. */}
          {diagramNodesInDrawOrder(nodes).map((node) => {
            const shape = node.shape ?? 'box';
            const size = effectiveDiagramNodeSize(node);
            const label = diagramNodeLabelLayout(node);

            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
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
                  textAnchor="middle"
                  fill={DIAGRAM_LABEL_INK}
                  style={{
                    fontSize: `${label.fontSize}px`,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontWeight: shape === 'text' ? 600 : 400,
                  }}
                >
                  {label.lines.map((line, lineIndex) => (
                    <tspan
                      key={line + String(lineIndex)}
                      x={size.width / 2}
                      y={label.firstBaselineY + lineIndex * label.lineHeight}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export function ProposalCard({
  item,
  isOwnedByViewer = false,
  isAuthorLeader = false,
  isNew = false,
}: ProposalCardProps) {
  const artifact = item.artifactJson;
  const isSticky = artifact.type === 'sticky';
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
      <article
        className="flex shrink-0 flex-col overflow-hidden border"
        style={{
          width: CARD_WIDTH[item.type],
          borderRadius: isSticky ? STICKY_RADIUS : CARD_RADIUS,
          borderColor: theme ? theme.border : CARD_BORDER,
          background: theme ? theme.bg : '#FFFFFF',
          boxShadow: CARD_SHADOW,
        }}
      >
        {artifact.type === 'sticky' ? (
          <p
            className="line-clamp-4 wrap-break-word font-medium text-rt-ink"
            style={{
              minHeight: 128,
              padding: '16px 14px 10px',
              // Shared with the editor's preview, so a note that had to shrink
              // to fit while you were writing it looks the same on the board.
              ...stickyTypography(artifact.text),
            }}
          >
            {artifact.text}
          </p>
        ) : null}

        {artifact.type === 'diagram' ? <DiagramBody item={item} /> : null}

        {artifact.type === 'drawing' ? (
          <div
            className="mx-2.5 mt-2.5 mb-1 overflow-hidden rounded-lg"
            style={{ height: 160, background: THUMB_BACKGROUND }}
          >
            {drawingSrc ? (
              <img
                src={drawingSrc}
                alt={`Drawing by ${item.authorName}`}
                loading="lazy"
                // Images are natively draggable, which would hijack a card drag.
                draggable={false}
                className="block h-full w-full object-contain"
              />
            ) : null}
          </div>
        ) : null}

        <CardFoot item={item} isOwnedByViewer={isOwnedByViewer} isAuthorLeader={isAuthorLeader} />
      </article>
    </div>
  );
}

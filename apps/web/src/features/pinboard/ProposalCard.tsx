import {
  DIAGRAM_LABEL_INK,
  diagramEdgeDash,
  diagramEdgeGeometry,
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

import {
  CARD_RADIUS,
  CARD_SHADOW,
  STICKY_RADIUS,
  STICKY_THEMES,
  cardWidthPx,
} from './pinboardTokens';

interface ProposalCardProps {
  item: BoardItem;
  zoom: 100 | 80 | 60 | 40;
  /**
   * Highlights the viewer's own cards. Nothing passes it yet — the canvas has
   * no viewer identity until auth lands, and F16 (author-only edit/delete) is
   * what makes the distinction actionable.
   */
  isOwnedByViewer?: boolean;
  /** Arrived on a live broadcast just now, so it gets a one-off highlight (F15). */
  isNew?: boolean;
}

function formatMetaTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SoftMeta({ item, compact }: { item: BoardItem; compact: boolean }) {
  return (
    <footer
      className="text-rt-ink-faint"
      style={{
        padding: compact ? '6px 10px 8px' : '8px 12px 10px',
        fontSize: compact ? '8px' : '11px',
      }}
    >
      <span className="font-medium text-rt-ink-muted">{item.authorName}</span>
      <span className="mx-1">·</span>
      <time dateTime={item.createdAt}>{formatMetaTime(item.createdAt)}</time>
    </footer>
  );
}

function StickyCard({ item, zoom, isOwnedByViewer = false }: ProposalCardProps) {
  if (item.artifactJson.type !== 'sticky') return null;
  const compact = zoom <= 60;
  const theme = STICKY_THEMES[item.artifactJson.color];
  const bg = isOwnedByViewer ? '#FDF4E5' : theme.bg;
  const border = isOwnedByViewer ? '#E0A33C' : theme.border;
  const width = cardWidthPx('sticky', zoom);

  return (
    <article
      className="flex shrink-0 flex-col overflow-hidden border"
      style={{
        width,
        borderRadius: STICKY_RADIUS,
        borderColor: border,
        background: bg,
        boxShadow: CARD_SHADOW,
      }}
    >
      <p
        className="line-clamp-4 font-medium text-rt-ink"
        style={{
          padding: compact ? '10px 12px 6px' : '16px 14px 10px',
          fontSize: compact ? '10px' : '14px',
          lineHeight: compact ? 1.35 : 1.45,
          minHeight: compact ? 80 : 128,
        }}
      >
        {item.artifactJson.text}
      </p>
      <SoftMeta item={item} compact={compact} />
    </article>
  );
}

function DrawingCard({ item, zoom, isOwnedByViewer = false }: ProposalCardProps) {
  if (item.artifactJson.type !== 'drawing') return null;
  const compact = zoom <= 60;
  const svg = item.artifactJson.svg.trim();
  const hasSvg = svg.length > 0;
  const width = cardWidthPx('drawing', zoom);
  // Never inject a peer's SVG into this document: it is arbitrary user-authored
  // markup, so inline <svg> would run any <script>/onload it carries in every
  // viewer's session. An <img> renders SVG with scripting and external fetches
  // disabled, so a hostile drawing is inert.
  const src = hasSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;

  return (
    <article
      className="flex shrink-0 flex-col overflow-hidden border bg-rt-surface"
      style={{
        width,
        borderRadius: CARD_RADIUS,
        borderColor: isOwnedByViewer ? '#E0A33C' : '#CFCFCF',
        background: isOwnedByViewer ? '#FDF4E5' : '#FFFFFF',
        boxShadow: CARD_SHADOW,
      }}
    >
      <div
        className="m-2.5 overflow-hidden rounded-lg"
        style={{
          height: compact ? 100 : 160,
          background: hasSvg
            ? '#F7F7F8'
            : 'repeating-linear-gradient(-45deg, #EEF2F4 0 8px, #F7F7F8 8px 16px)',
        }}
      >
        {src ? (
          <img
            src={src}
            alt={`Drawing by ${item.authorName}`}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : null}
      </div>
      <SoftMeta item={item} compact={compact} />
    </article>
  );
}

function DiagramCard({ item, zoom, isOwnedByViewer = false }: ProposalCardProps) {
  if (item.artifactJson.type !== 'diagram') return null;
  const compact = zoom <= 60;
  const { nodes, edges } = item.artifactJson;
  const diagramNodes = nodes;
  const nodeById = new Map(diagramNodes.map((node) => [node.id, node]));
  const svgWidth =
    Math.max(...diagramNodes.map((node) => node.x + effectiveDiagramNodeSize(node).width), 72) + 28;
  const svgHeight =
    Math.max(...diagramNodes.map((node) => node.y + effectiveDiagramNodeSize(node).height), 32) +
    24;
  const width = cardWidthPx('diagram', zoom);
  // Proposal-scoped marker ids prevent arrows in separate diagram cards from
  // colliding, and one marker per resolved colour keeps every arrowhead matching
  // the line it terminates.
  const arrowId = (color: string) => `rt-arrow-${item.id}-${color.replace('#', '')}`;
  const arrowColors = [...new Set(edges.map((edge) => diagramEdgeStroke(edge)))];

  return (
    <article
      className="flex shrink-0 flex-col overflow-hidden border bg-rt-surface"
      style={{
        width,
        borderRadius: CARD_RADIUS,
        borderColor: isOwnedByViewer ? '#E0A33C' : '#CFCFCF',
        background: isOwnedByViewer ? '#FDF4E5' : '#FFFFFF',
        boxShadow: CARD_SHADOW,
      }}
    >
      <div
        className="m-2.5 overflow-hidden rounded-lg bg-rt-surface-alt"
        style={{ minHeight: compact ? 64 : 96 }}
      >
        {diagramNodes.length === 0 ? (
          <div className="m-2 flex h-20 items-center justify-center rounded-md border border-dashed border-rt-tertiary" />
        ) : (
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="h-full w-full"
            style={{ minHeight: compact ? 64 : 96 }}
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
            {edges.map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to) return null;
              const geometry = diagramEdgeGeometry(from, to);
              const stroke = diagramEdgeStroke(edge);
              // 1.5 is this preview's own pre-v2 width, kept for unstyled arrows.
              const strokeWidth = diagramEdgeStrokeWidth(edge, 1.5);
              return (
                <g key={`${edge.from}-${edge.to}`}>
                  <line
                    x1={geometry.x1}
                    y1={geometry.y1}
                    x2={geometry.x2}
                    y2={geometry.y2}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    markerEnd={`url(#${arrowId(stroke)})`}
                    {...diagramEdgeDash(edge, strokeWidth)}
                  />
                  {edge.label ? (
                    <text
                      x={geometry.labelX}
                      y={geometry.labelY}
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
            {/* Containers are drawn before what they hold, so a group reads as
                a backdrop rather than covering its own contents. */}
            {diagramNodesInDrawOrder(diagramNodes).map((node) => {
              const shape = node.shape ?? 'box';
              const size = effectiveDiagramNodeSize(node);
              const label = diagramNodeLabelLayout(node);

              return (
                <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                  <DiagramShapeOutline
                    shape={shape}
                    size={size}
                    fill={
                      shape === 'text' && !node.fillColor ? 'transparent' : diagramNodeFill(node)
                    }
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
                    {label.lines.map((line, index) => (
                      <tspan
                        key={line + String(index)}
                        x={size.width / 2}
                        y={label.firstBaselineY + index * label.lineHeight}
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
      <SoftMeta item={item} compact={compact} />
    </article>
  );
}

export function ProposalCard({
  item,
  zoom,
  isOwnedByViewer = false,
  isNew = false,
}: ProposalCardProps) {
  const card = (() => {
    switch (item.type) {
      case 'sticky':
        return <StickyCard item={item} zoom={zoom} isOwnedByViewer={isOwnedByViewer} />;
      case 'drawing':
        return <DrawingCard item={item} zoom={zoom} isOwnedByViewer={isOwnedByViewer} />;
      case 'diagram':
        return <DiagramCard item={item} zoom={zoom} isOwnedByViewer={isOwnedByViewer} />;
      default:
        return null;
    }
  })();

  // Always wrapped, highlighted or not: toggling the wrapper in and out would
  // remount the card and make drawings refetch their image mid-animation.
  return (
    <div
      className={isNew ? 'shrink-0 rt-proposal-arrive' : 'shrink-0'}
      style={{ borderRadius: item.type === 'sticky' ? STICKY_RADIUS : CARD_RADIUS }}
    >
      {card}
    </div>
  );
}

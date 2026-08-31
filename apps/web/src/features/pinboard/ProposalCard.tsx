import type { BoardItem } from '@roundtable/shared';

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
  const previewNodes = nodes.slice(0, 4);
  const nodeById = new Map(previewNodes.map((n) => [n.id, n]));
  const svgWidth = Math.max(...previewNodes.map((n) => n.x), 0) + 100;
  const svgHeight = Math.max(...previewNodes.map((n) => n.y), 0) + 56;
  const width = cardWidthPx('diagram', zoom);
  // SVG ids are document-global: an unsuffixed "rt-arrow" would collide across
  // every diagram card on the board and all of them would resolve to the first.
  const arrowId = `rt-arrow-${item.id}`;

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
        {previewNodes.length === 0 ? (
          <div className="m-2 flex h-[80px] items-center justify-center rounded-md border border-dashed border-rt-tertiary" />
        ) : (
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="h-full w-full"
            style={{ minHeight: compact ? 64 : 96 }}
          >
            <defs>
              <marker id={arrowId} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#8CA4AC" />
              </marker>
            </defs>
            {edges.map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to) return null;
              return (
                <line
                  key={`${edge.from}-${edge.to}`}
                  x1={from.x + 72}
                  y1={from.y + 16}
                  x2={to.x}
                  y2={to.y + 16}
                  stroke="#8CA4AC"
                  strokeWidth={1.5}
                  markerEnd={`url(#${arrowId})`}
                />
              );
            })}
            {previewNodes.map((node, index) => (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                <rect
                  width="72"
                  height="32"
                  rx="8"
                  fill={index === 0 ? '#EEF2F4' : '#FFFFFF'}
                  stroke={index === 0 ? '#8CA4AC' : '#CFCFCF'}
                  strokeWidth={1}
                />
                <text
                  x="36"
                  y="20"
                  textAnchor="middle"
                  fill="#080C15"
                  style={{ fontSize: '11px', fontFamily: 'Inter, system-ui, sans-serif' }}
                >
                  {node.label}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
      <SoftMeta item={item} compact={compact} />
    </article>
  );
}

export function ProposalCard({ item, zoom, isOwnedByViewer = false }: ProposalCardProps) {
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
}

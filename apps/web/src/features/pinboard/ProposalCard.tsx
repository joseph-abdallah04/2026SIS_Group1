import { diagramEdgeGeometry, diagramNodeSize, type BoardItem } from '@roundtable/shared';

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
 * Full diagram preview (F21): shapes, arrows, labels, shared geometry.
 * Kept as an SVG so the board matches what the diagram editor produced.
 */
function DiagramBody({ item }: { item: BoardItem }) {
  if (item.artifactJson.type !== 'diagram') return null;
  const { nodes, edges } = item.artifactJson;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const svgWidth =
    Math.max(...nodes.map((node) => node.x + diagramNodeSize(node.shape).width), 72) + 28;
  const svgHeight =
    Math.max(...nodes.map((node) => node.y + diagramNodeSize(node.shape).height), 32) + 24;
  // Proposal-scoped marker ids prevent arrows in separate diagram cards from colliding.
  const arrowId = `rt-arrow-${item.id}`;

  return (
    <div className="mx-2.5 mt-2.5 mb-1 overflow-hidden rounded-lg bg-rt-surface-alt" style={{ minHeight: 96 }}>
      {nodes.length === 0 ? (
        <div className="m-2 flex h-20 items-center justify-center rounded-md border border-dashed border-rt-tertiary" />
      ) : (
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="h-full w-full"
          style={{ minHeight: 96 }}
        >
          <defs>
            <marker
              id={arrowId}
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill="#8CA4AC" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) return null;
            const geometry = diagramEdgeGeometry(from, to);
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <line
                  x1={geometry.x1}
                  y1={geometry.y1}
                  x2={geometry.x2}
                  y2={geometry.y2}
                  stroke="#8CA4AC"
                  strokeWidth={1.5}
                  markerEnd={`url(#${arrowId})`}
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
          {nodes.map((node, index) => {
            const shape = node.shape ?? 'box';
            const size = diagramNodeSize(node.shape);
            const emphasised = shape === 'box' && index === 0;

            return (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                {shape === 'text' ? null : (
                  <rect
                    width={size.width}
                    height={size.height}
                    rx={shape === 'container' ? 3 : 8}
                    fill={shape === 'container' ? '#FAFAFA' : emphasised ? '#EEF2F4' : '#FFFFFF'}
                    stroke={shape === 'container' || emphasised ? '#8CA4AC' : '#CFCFCF'}
                    strokeDasharray={shape === 'container' ? '4 3' : undefined}
                    strokeWidth={1}
                  />
                )}
                <text
                  x={size.width / 2}
                  y={size.height / 2 + 4}
                  textAnchor="middle"
                  fill="#080C15"
                  textLength={node.label.length > 10 ? size.width - 12 : undefined}
                  lengthAdjust={node.label.length > 10 ? 'spacingAndGlyphs' : undefined}
                  style={{
                    fontSize: '11px',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontWeight: shape === 'text' ? 600 : 400,
                  }}
                >
                  {node.label}
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

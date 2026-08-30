// Renders a diagram artifact as inline SVG.
//
// Inline rather than a chart library: the artifact is already laid out server-side, the
// shapes are boxes and arrows, and a dependency-free renderer keeps the same component
// usable by the Tools owner's diagram editor later.
import { useId } from 'react';
import type { DiagramArtifact } from '@roundtable/shared';

const NODE_WIDTH = 168;
const NODE_HEIGHT = 56;
const PADDING = 24;
const CHARS_PER_LINE = 22;
const MAX_LINES = 2;

export function DiagramPreview({ diagram }: { diagram: DiagramArtifact }) {
  const arrowId = useId().replace(/:/g, '');
  const positions = new Map(diagram.nodes.map((node) => [node.id, node]));

  const maxX = Math.max(...diagram.nodes.map((n) => n.x)) + NODE_WIDTH;
  const maxY = Math.max(...diagram.nodes.map((n) => n.y)) + NODE_HEIGHT;
  const minX = Math.min(...diagram.nodes.map((n) => n.x));
  const minY = Math.min(...diagram.nodes.map((n) => n.y));
  const viewBox = [
    minX - PADDING,
    minY - PADDING,
    maxX - minX + PADDING * 2,
    maxY - minY + PADDING * 2,
  ].join(' ');

  return (
    <svg
      viewBox={viewBox}
      className="h-auto w-full"
      role="img"
      aria-label={diagram.title ? `Diagram: ${diagram.title}` : 'Generated diagram'}
    >
      <defs>
        <marker
          id={`arrow-${arrowId}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-slate-400" />
        </marker>
      </defs>

      {diagram.edges.map((edge, index) => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) return null;

        // Anchor on the facing edge of each box so the arrow doesn't run under the label.
        const start = anchor(from, to);
        const end = anchor(to, from);
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;

        return (
          <g key={`${edge.from}-${edge.to}-${index}`}>
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              className="stroke-slate-400"
              strokeWidth={1.5}
              markerEnd={`url(#arrow-${arrowId})`}
            />
            {edge.label && (
              <text
                x={midX}
                y={midY - 6}
                textAnchor="middle"
                className="fill-slate-500 text-[11px]"
                style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 4 }}
              >
                {edge.label}
              </text>
            )}
          </g>
        );
      })}

      {diagram.nodes.map((node) => {
        const lines = wrap(node.label);
        return (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={10}
              className="fill-white stroke-indigo-300"
              strokeWidth={1.5}
            />
            {lines.map((line, i) => (
              <text
                key={i}
                x={node.x + NODE_WIDTH / 2}
                y={node.y + NODE_HEIGHT / 2 + (i - (lines.length - 1) / 2) * 14 + 4}
                textAnchor="middle"
                className="fill-slate-700 text-[12px] font-medium"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** Point on `node`'s border facing `toward`, so arrows meet boxes rather than centres. */
function anchor(
  node: { x: number; y: number },
  toward: { x: number; y: number },
): { x: number; y: number } {
  const cx = node.x + NODE_WIDTH / 2;
  const cy = node.y + NODE_HEIGHT / 2;
  const tx = toward.x + NODE_WIDTH / 2;
  const ty = toward.y + NODE_HEIGHT / 2;

  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  // Scale the direction vector until it hits the box edge.
  const scaleX = dx === 0 ? Infinity : NODE_WIDTH / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : NODE_HEIGHT / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/** Greedy word wrap; the last visible line is ellipsised rather than overflowing the box. */
function wrap(label: string): string[] {
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= CHARS_PER_LINE) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  if (lines.length > MAX_LINES) {
    const kept = lines.slice(0, MAX_LINES);
    kept[MAX_LINES - 1] = `${(kept[MAX_LINES - 1] ?? '').slice(0, CHARS_PER_LINE - 1)}…`;
    return kept;
  }
  return lines.length > 0 ? lines : [label];
}

// Renders a diagram artifact as inline SVG, at chat-panel scale.
//
// Node sizes and edge anchors come from the shared geometry helpers the board uses
// (`diagramNodeSize` / `diagramEdgeGeometry`), so what you see in chat is what lands on the
// pinboard when you press Propose — same boxes, same arrows, just smaller.
import { useId } from 'react';
import { diagramEdgeGeometry, diagramNodeSize, type DiagramArtifact } from '@roundtable/shared';

const PADDING = 20;
const CHARS_PER_LINE = 18;
const MAX_LINES = 2;

export function DiagramPreview({ diagram }: { diagram: DiagramArtifact }) {
  // Marker ids must be unique per rendered diagram or arrows from one card leak into another.
  const arrowId = `rt-assistant-arrow-${useId().replace(/:/g, '')}`;
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));

  const width =
    Math.max(...diagram.nodes.map((n) => n.x + diagramNodeSize(n.shape).width), 72) + PADDING;
  const height =
    Math.max(...diagram.nodes.map((n) => n.y + diagramNodeSize(n.shape).height), 32) + PADDING;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Generated diagram"
    >
      <defs>
        <marker
          id={arrowId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#8CA4AC" />
        </marker>
      </defs>

      {diagram.edges.map((edge, index) => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from || !to) return null;
        const geometry = diagramEdgeGeometry(from, to);

        return (
          <g key={`${edge.from}-${edge.to}-${index}`}>
            <line
              x1={geometry.x1}
              y1={geometry.y1}
              x2={geometry.x2}
              y2={geometry.y2}
              stroke="#8CA4AC"
              strokeWidth={1.5}
              markerEnd={`url(#${arrowId})`}
            />
            {edge.label && (
              <text
                x={geometry.labelX}
                y={geometry.labelY}
                textAnchor="middle"
                className="text-[10px]"
                fill="#5A5F68"
                style={{ paintOrder: 'stroke', stroke: '#FFFFFF', strokeWidth: 4 }}
              >
                {edge.label}
              </text>
            )}
          </g>
        );
      })}

      {diagram.nodes.map((node) => {
        const size = diagramNodeSize(node.shape);
        const lines = wrap(node.label);
        return (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={size.width}
              height={size.height}
              rx={10}
              fill="#FFFFFF"
              stroke="#8CA4AC"
              strokeWidth={1.5}
            />
            {lines.map((line, i) => (
              <text
                key={i}
                x={node.x + size.width / 2}
                y={node.y + size.height / 2 + (i - (lines.length - 1) / 2) * 13 + 4}
                textAnchor="middle"
                className="text-[11px] font-medium"
                fill="#080C15"
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

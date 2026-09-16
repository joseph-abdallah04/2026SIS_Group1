// Renders a diagram artifact as inline SVG, at chat-panel scale.
//
// Geometry, palettes, routing and outlines are the same helpers the pinboard
// card uses, so a preview is a smaller print of what Propose will drop — not a
// second drawing of the graph. The SVG keeps its own aspect ratio and is
// fitted into a bounded well, so a tall stack does not blow the rail open and
// a wide chain does not get letterboxed into unreadably small boxes.
import { useId, type CSSProperties } from 'react';
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
  type DiagramArtifact,
} from '@roundtable/shared';

import { DiagramShapeOutline } from '../../components/ui/DiagramShapeOutline';

const PAD_X = 28;
const PAD_Y = 24;

export function DiagramPreview({ diagram }: { diagram: DiagramArtifact }) {
  const uid = useId().replace(/:/g, '');
  const { nodes, edges } = diagram;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const svgWidth =
    Math.max(...nodes.map((node) => node.x + effectiveDiagramNodeSize(node).width), 72) + PAD_X;
  const svgHeight =
    Math.max(...nodes.map((node) => node.y + effectiveDiagramNodeSize(node).height), 32) + PAD_Y;
  const arrowId = (color: string) => `rt-assistant-arrow-${uid}-${color.replace('#', '')}`;
  const arrowColors = [...new Set(edges.map((edge) => diagramEdgeStroke(edge)))];
  const edgeRoutes = diagramEdgeRoutes(nodes, edges);

  if (nodes.length === 0) {
    return <div className="rt-assistant-diagram-fit" aria-label="Empty diagram" />;
  }

  return (
    <div
      className="rt-assistant-diagram-fit"
      style={
        {
          '--rt-diagram-w': String(svgWidth),
          '--rt-diagram-h': String(svgHeight),
        } as CSSProperties
      }
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Generated diagram"
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
          const strokeWidth = diagramEdgeStrokeWidth(edge, 1.5);
          return (
            <g key={`${edge.from}-${edge.to}-${index}`}>
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
                  stroke="#FFFFFF"
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
        {diagramNodesInDrawOrder(nodes).map((node) => {
          const shape = node.shape ?? 'box';
          const size = effectiveDiagramNodeSize(node);
          const label = diagramNodeLabelLayout(node);
          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})${
                node.rotation
                  ? ` rotate(${node.rotation} ${size.width / 2} ${size.height / 2})`
                  : ''
              }`}
            >
              <DiagramShapeOutline
                shape={shape}
                size={size}
                fill={shape === 'text' && !node.fillColor ? 'transparent' : diagramNodeFill(node)}
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
    </div>
  );
}

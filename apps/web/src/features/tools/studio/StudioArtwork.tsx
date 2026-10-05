// A studio canvas, drawn: the board card's picture of a proposal, and the
// thumbnail and drop preview of a template.
//
// Everything a studio canvas holds (F21) — every shape, arrow, label, size and
// style the editor produced. Geometry, palettes, routing and outlines all come
// from `@roundtable/shared`, so nothing drawn here can drift from the editor.
// It is presentational: no selection, no hit targets, no state.

import { useId } from 'react';
import {
  arrowGeometry,
  diagramEdgeDash,
  diagramEdgeKey,
  diagramEdgeRoutes,
  diagramEdgeStroke,
  diagramEdgeStrokeWidth,
  diagramNodeFill,
  diagramNodeLabelLayout,
  diagramNodeLabelStyle,
  diagramNodeStroke,
  diagramNodeStrokeWidth,
  effectiveDiagramNodeSize,
  diagramExtent,
  inkPoints,
  inkRotationTransform,
  inkStrokeColor,
  inkStrokeWidth,
  isEmptyStudioScene,
  pathFill,
  pathRotationTransform,
  pathStrokeColor,
  pathStrokeWidth,
  pathSvgData,
  strokePathData,
  studioPaintOrder,
  studioSceneBounds,
  type StudioScene,
} from '@roundtable/shared';

import { DiagramShapeOutline } from '../../../components/ui/DiagramShapeOutline';
import { arrowTargetLookup } from './studioArrowTargets';
import { StudioArrowView } from './StudioArrowView';
import { StudioTableView } from './StudioTableView';

// The canvas type and its framing live in `@roundtable/shared`, so the card, a
// card's export and the recap PDF frame a canvas the same way.
export { diagramExtent, studioSceneBounds, type StudioScene } from '@roundtable/shared';

/**
 * Everything on a canvas, painted in its own order, into whatever SVG it is put
 * in. The editor draws a template's drop preview with this, inside the canvas;
 * `StudioArtwork` wraps it in an SVG of its own.
 */
export function StudioSceneContent({ scene }: { scene: StudioScene }) {
  const { nodes, edges } = scene;
  const ink = scene.ink ?? [];
  const paths = scene.paths ?? [];
  const tables = scene.tables ?? [];
  const arrows = scene.arrows ?? [];
  // Unpacked once per render: each stroke's path data needs every point.
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
  // Marker ids are scoped to this drawing, not to what it draws: the same
  // diagram is on the page twice while its canvas is open — the card and the
  // enlarged view — and two identical ids leave both `url(#…)` arrowheads
  // resolving to whichever was written first. One id per resolved colour keeps
  // each arrowhead matching its line.
  const instance = useId().replace(/:/g, '');
  const arrowId = (color: string) => `rt-arrow-${instance}-${color.replace('#', '')}`;
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
    <>
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
      {/* Painted in the canvas's own order, so a sketch sits above or below a
          shape here exactly as it did in the editor. */}
      {studioPaintOrder(scene).map((ref) => {
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
          return table ? <StudioTableView key={table.id} table={table} /> : null;
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
    </>
  );
}

interface StudioArtworkProps {
  scene: StudioScene;
  /**
   * `sheet` keeps where on the sheet the content sat, as a proposal's card
   * does; `content` frames the content alone, as a template's thumbnail does.
   */
  fit?: 'sheet' | 'content';
  className?: string;
}

/**
 * A canvas drawn into whatever box it is given, keeping its own shape within
 * it. The card's plate, the preview's larger frame and a template's thumbnail
 * all show a canvas this way.
 */
export function StudioArtwork({
  scene,
  fit = 'sheet',
  className = 'absolute inset-0 h-full w-full p-2.5',
}: StudioArtworkProps) {
  // A studio canvas is empty only when it holds nothing at all — a sketch, a
  // line, a table or an arrow is as much a diagram as a shape is.
  if (isEmptyStudioScene(scene)) {
    return <div className="absolute inset-3 rounded-md border border-dashed border-rt-tertiary" />;
  }
  const viewBox = (() => {
    if (fit === 'sheet') {
      const { x, y, width, height } = diagramExtent(scene);
      return `${x} ${y} ${width} ${height}`;
    }
    const bounds = studioSceneBounds(scene);
    const pad = 12;
    return `${bounds.x - pad} ${bounds.y - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`;
  })();
  return (
    <svg viewBox={viewBox} className={className}>
      <StudioSceneContent scene={scene} />
    </svg>
  );
}

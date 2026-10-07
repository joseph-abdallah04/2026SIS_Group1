// A studio canvas as SVG markup, for the recap PDF.
//
// The board draws a canvas with React (`StudioSceneContent` in the web app);
// the server has no React, so this is the same drawing written out as strings.
// Every measurement, colour, route and paint order comes from
// `@roundtable/shared`, the same helpers the board calls, so the two can only
// differ in how they spell an element, never in where it goes.
//
// Before this, the recap drew only a canvas's shapes and connectors: sketches,
// pen paths, tables, free arrows, rotation and label styling were dropped, and a
// canvas with no shapes on it came out as an empty plate.

import {
  DIAGRAM_LABEL_INK,
  DIAGRAM_STROKE_COLORS,
  TABLE_CELL_PADDING,
  arrowFontSize,
  arrowGeometry,
  arrowLabelLines,
  arrowStrokeColor,
  arrowStrokeWidth,
  arrowTargetLookup,
  diagramCylinderCapHeight,
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
  inkPoints,
  inkRotationTransform,
  inkStrokeColor,
  inkStrokeWidth,
  pathFill,
  pathRotationTransform,
  pathStrokeColor,
  pathStrokeWidth,
  pathSvgData,
  strokePathData,
  studioPaintOrder,
  tableAreaSize,
  tableCellArea,
  tableCellAt,
  tableCellBold,
  tableCellColor,
  tableCellFill,
  tableCellFontSize,
  tableCellLines,
  tableColCount,
  tableColumnOffsets,
  tableGridPath,
  tableRowOffsets,
  tableSize,
  tableStrokeColor,
  tableStrokeWidth,
  type ArrowCapGeometry,
  type ArrowElement,
  type ArrowGeometry,
  type DiagramEdge,
  type DiagramNode,
  type DiagramNodeShape,
  type DiagramNodeSize,
  type StudioScene,
  type TableElement,
} from '@roundtable/shared';

/** Inter where the machine has it, then the faces every server does. */
export const FONT_FAMILY = 'Inter, Helvetica, Arial, sans-serif';
/** What a hollow arrow cap and a label's halo are filled with: the card's white. */
const SURFACE = '#FFFFFF';
/** The board card's own corner radius for a table, in table units. */
const TABLE_CORNER_RADIUS = 6;

export function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** ` name="value"` when there is a value, and nothing when there is not. */
function attr(name: string, value: string | number | undefined): string {
  return value === undefined || value === '' ? '' : ` ${name}="${xml(String(value))}"`;
}

function dashAttrs(dash: { strokeDasharray?: string; strokeLinecap?: string }): string {
  return (
    attr('stroke-dasharray', dash.strokeDasharray) + attr('stroke-linecap', dash.strokeLinecap)
  );
}

function shapeMarkup(
  shape: DiagramNodeShape,
  size: DiagramNodeSize,
  fill: string,
  stroke: string,
  strokeWidth: number,
): string {
  const { width, height } = size;
  const common = `fill="${xml(fill)}" stroke="${xml(stroke)}" stroke-width="${strokeWidth}"`;
  switch (shape) {
    case 'ellipse':
      return `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" ${common}/>`;
    case 'diamond':
      return `<path d="M${width / 2},0 L${width},${height / 2} L${width / 2},${height} L0,${height / 2} Z" ${common}/>`;
    case 'triangle':
      return `<path d="M${width / 2},0 L${width},${height} L0,${height} Z" ${common}/>`;
    case 'cylinder': {
      const cap = diagramCylinderCapHeight(height);
      return `<path d="M0,${cap} A${width / 2},${cap} 0 0 1 ${width},${cap} L${width},${height - cap} A${width / 2},${cap} 0 0 1 0,${height - cap} Z" ${common}/><path d="M0,${cap} A${width / 2},${cap} 0 0 0 ${width},${cap}" fill="none" stroke="${xml(stroke)}" stroke-width="${strokeWidth}"/>`;
    }
    case 'rectangle':
      return `<rect width="${width}" height="${height}" ${common}/>`;
    case 'container':
      return `<rect width="${width}" height="${height}" rx="3" ${common} stroke-dasharray="4 3"/>`;
    case 'text':
      return `<rect width="${width}" height="${height}" fill="${xml(fill)}"/>`;
    default:
      return `<rect width="${width}" height="${height}" rx="8" ${common}/>`;
  }
}

function nodeMarkup(node: DiagramNode): string {
  const shape = node.shape ?? 'box';
  const size = effectiveDiagramNodeSize(node);
  const label = diagramNodeLabelLayout(node);
  const labelStyle = diagramNodeLabelStyle(node, size.width);
  const fill = shape === 'text' && !node.fillColor ? 'none' : diagramNodeFill(node);
  // The board draws labels a shade lighter than the editor unless bold.
  const fontWeight = node.labelBold ? labelStyle.fontWeight : shape === 'text' ? 600 : 400;
  const rotate = node.rotation
    ? ` rotate(${node.rotation} ${size.width / 2} ${size.height / 2})`
    : '';
  const tspans = label.lines
    .map(
      (line, index) =>
        `<tspan x="${labelStyle.x}" y="${label.firstBaselineY + index * label.lineHeight}">${xml(line)}</tspan>`,
    )
    .join('');
  return `<g transform="translate(${node.x}, ${node.y})${rotate}">${shapeMarkup(
    shape,
    size,
    fill,
    diagramNodeStroke(node, '#8CA4AC'),
    diagramNodeStrokeWidth(node, 1),
  )}<text text-anchor="${labelStyle.anchor}" fill="${xml(labelStyle.fill)}" font-size="${label.fontSize}" font-family="${FONT_FAMILY}" font-weight="${fontWeight}">${tspans}</text></g>`;
}

function edgeMarkup(
  edge: DiagramEdge,
  route: { path: string; labelX: number; labelY: number } | null | undefined,
  arrowId: (color: string) => string,
): string {
  if (!route) return '';
  const stroke = diagramEdgeStroke(edge);
  const strokeWidth = diagramEdgeStrokeWidth(edge, 1.5);
  const label = edge.label
    ? `<text x="${route.labelX}" y="${route.labelY}" text-anchor="middle" fill="#5A5F68" stroke="#F7F7F8" stroke-width="3" paint-order="stroke" font-size="9" font-family="${FONT_FAMILY}">${xml(edge.label)}</text>`
    : '';
  return `<path d="${xml(route.path)}" fill="none" stroke="${xml(stroke)}" stroke-width="${strokeWidth}" marker-end="url(#${arrowId(stroke)})"${dashAttrs(diagramEdgeDash(edge, strokeWidth))}/>${label}`;
}

function capMarkup(cap: ArrowCapGeometry, stroke: string, strokeWidth: number): string {
  if (cap.d === '') return '';
  const fill = cap.closed ? (cap.filled ? stroke : SURFACE) : 'none';
  return `<path d="${xml(cap.d)}" fill="${xml(fill)}" stroke="${xml(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function arrowMarkup(arrow: ArrowElement, geometry: ArrowGeometry): string {
  const color = arrowStrokeColor(arrow);
  const width = arrowStrokeWidth(arrow);
  const fontSize = arrowFontSize(arrow);
  const lines = arrow.label ? arrowLabelLines(arrow.label) : [];
  const line = `<path d="${xml(geometry.d)}" fill="none" stroke="${xml(color)}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dashAttrs(diagramEdgeDash(arrow, width))}/>`;
  const caps = capMarkup(geometry.start, color, width) + capMarkup(geometry.end, color, width);
  if (lines.length === 0) return line + caps;
  const labelFill = arrow.labelColor ? DIAGRAM_STROKE_COLORS[arrow.labelColor] : DIAGRAM_LABEL_INK;
  // Spelled as each line's baseline rather than `dominant-baseline`, which not
  // every rasteriser honours: centred on the label point, so a two-line label
  // straddles the spot a one-line label sat on.
  const lineHeight = fontSize * 1.2;
  const firstBaseline = geometry.label.y - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35;
  const tspans = lines
    .map(
      (text, index) =>
        `<tspan x="${geometry.label.x}" y="${firstBaseline + index * lineHeight}">${xml(text)}</tspan>`,
    )
    .join('');
  const label = `<text text-anchor="middle" fill="${xml(labelFill)}" stroke="${SURFACE}" stroke-width="4" paint-order="stroke" font-size="${fontSize}" font-family="${FONT_FAMILY}" font-weight="${arrow.labelBold ? 700 : 400}">${tspans}</text>`;
  return line + caps + label;
}

function tableMarkup(table: TableElement, clipId: string): string {
  const cols = tableColCount(table);
  const colOffsets = tableColumnOffsets(table);
  const rowOffsets = tableRowOffsets(table);
  const size = tableSize(table);
  const stroke = tableStrokeColor(table);
  const strokeWidth = tableStrokeWidth(table);
  const radius = Math.min(TABLE_CORNER_RADIUS, size.width / 2, size.height / 2);

  const fills: string[] = [];
  const texts: string[] = [];
  table.cells.forEach((_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const area = tableCellArea(table, row, col);
    // A merged cell is drawn once, from its top-left cell.
    if (area.row !== row || area.col !== col) return;
    const box = tableAreaSize(table, area);
    const x = colOffsets[col] ?? 0;
    const y = rowOffsets[row] ?? 0;
    const cell = tableCellAt(table, row, col);
    fills.push(
      `<rect x="${x}" y="${y}" width="${box.width}" height="${box.height}" fill="${xml(tableCellFill(table, cell, row))}"/>`,
    );

    const lines = tableCellLines(table, cell, col, row);
    if (lines.length === 0) return;
    const fontSize = tableCellFontSize(table, cell);
    const lineHeight = fontSize * 1.25;
    const align = cell?.align ?? 'left';
    const textX =
      align === 'center'
        ? x + box.width / 2
        : align === 'right'
          ? x + box.width - TABLE_CELL_PADDING
          : x + TABLE_CELL_PADDING;
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
    const tspans = lines
      .map((line, lineIndex) => {
        const baseline =
          y +
          box.height / 2 +
          fontSize / 3 -
          ((lines.length - 1) * lineHeight) / 2 +
          lineIndex * lineHeight;
        return `<tspan x="${textX}" y="${baseline}">${xml(line)}</tspan>`;
      })
      .join('');
    texts.push(
      `<text text-anchor="${anchor}" fill="${xml(tableCellColor(cell))}" font-size="${fontSize}" font-family="${FONT_FAMILY}" font-weight="${tableCellBold(table, cell, row) ? 600 : 400}">${tspans}</text>`,
    );
  });

  return `<g transform="translate(${table.x}, ${table.y})"><defs><clipPath id="${clipId}"><rect width="${size.width}" height="${size.height}" rx="${radius}"/></clipPath></defs><g clip-path="url(#${clipId})">${fills.join('')}</g><path d="${xml(tableGridPath(table))}" fill="none" stroke="${xml(stroke)}" stroke-width="${strokeWidth}"/><rect width="${size.width}" height="${size.height}" rx="${radius}" fill="none" stroke="${xml(stroke)}" stroke-width="${strokeWidth}"/>${texts.join('')}</g>`;
}

/**
 * Everything on a canvas, painted in the canvas's own order, as the inside of
 * an `<svg>` in canvas units. `idPrefix` keeps marker and clip ids apart when
 * several canvases share one document.
 */
export function studioSceneMarkup(scene: StudioScene, idPrefix: string): string {
  const { nodes, edges } = scene;
  const ink = (scene.ink ?? []).map((stroke) => ({ ...stroke, points: inkPoints(stroke) }));
  const paths = scene.paths ?? [];
  const tables = scene.tables ?? [];
  const arrows = scene.arrows ?? [];
  const safePrefix = idPrefix.replace(/[^A-Za-z0-9_-]/g, '');

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const inkById = new Map(ink.map((stroke) => [stroke.id, stroke]));
  const pathById = new Map(paths.map((path) => [path.id, path]));
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const arrowById = new Map(arrows.map((arrow) => [arrow.id, arrow]));
  const targets = arrowTargetLookup({ nodes, ink, paths, tables });
  const edgeIndexByKey = new Map(edges.map((edge, index) => [diagramEdgeKey(edge), index]));
  const edgeRoutes = diagramEdgeRoutes(nodes, edges);

  const arrowId = (color: string) => `rt-pdf-arrow-${safePrefix}-${color.replace('#', '')}`;
  const markers = [...new Set(edges.map((edge) => diagramEdgeStroke(edge)))]
    .map(
      (color) =>
        `<marker id="${arrowId(color)}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6 Z" fill="${xml(color)}"/></marker>`,
    )
    .join('');

  let tableCount = 0;
  const body = studioPaintOrder(scene)
    .map((ref) => {
      switch (ref.kind) {
        case 'edge': {
          const index = edgeIndexByKey.get(ref.key);
          const edge = index === undefined ? undefined : edges[index];
          if (!edge || index === undefined) return '';
          if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) return '';
          return edgeMarkup(edge, edgeRoutes[index], arrowId);
        }
        case 'ink': {
          const stroke = inkById.get(ref.key);
          if (!stroke) return '';
          return `<path${attr('transform', inkRotationTransform(stroke))} d="${xml(strokePathData(stroke.points))}" fill="none" stroke="${xml(inkStrokeColor(stroke))}" stroke-width="${inkStrokeWidth(stroke)}" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        case 'path': {
          const path = pathById.get(ref.key);
          if (!path) return '';
          const width = pathStrokeWidth(path);
          return `<path${attr('transform', pathRotationTransform(path))} d="${xml(pathSvgData(path))}" fill="${xml(pathFill(path))}" stroke="${xml(pathStrokeColor(path))}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dashAttrs(diagramEdgeDash(path, width))}/>`;
        }
        case 'table': {
          const table = tableById.get(ref.key);
          if (!table) return '';
          tableCount += 1;
          return tableMarkup(table, `rt-pdf-table-${safePrefix}-${tableCount}`);
        }
        case 'arrow': {
          const arrow = arrowById.get(ref.key);
          return arrow ? arrowMarkup(arrow, arrowGeometry(arrow, targets)) : '';
        }
        default: {
          const node = nodeById.get(ref.key);
          return node ? nodeMarkup(node) : '';
        }
      }
    })
    .join('');

  return `<defs>${markers}</defs>${body}`;
}

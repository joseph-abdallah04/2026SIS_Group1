// One arrow, drawn.
//
// Two surfaces draw arrows — the studio canvas and the board card — and they
// have to agree exactly, so this is a component rather than a pair of JSX
// blocks. It is presentational only: it takes geometry that has already been
// resolved and renders it. Selection rings, hit targets and pointer handlers
// belong to whichever surface has them, and wrap this.
//
// The caps are paths rather than SVG markers. A marker is addressed by url, so
// ten cap shapes across eight stroke colours at both ends would be eighty
// definitions to mint and keep alive per surface — and a hollow marker still
// could not take the colour of the canvas behind it.

import {
  DIAGRAM_LABEL_INK,
  DIAGRAM_STROKE_COLORS,
  arrowFontSize,
  arrowStrokeColor,
  arrowStrokeWidth,
  diagramEdgeDash,
  type ArrowCapGeometry,
  type ArrowElement,
  type ArrowGeometry,
} from '@roundtable/shared';

/** The colour behind the arrow, which is what a hollow cap is filled with. */
const DEFAULT_SURFACE = '#FFFFFF';

interface StudioArrowViewProps {
  arrow: ArrowElement;
  geometry: ArrowGeometry;
  /** Overrides the arrow's own colour, which is how a surface shows selection. */
  stroke?: string;
  strokeWidth?: number;
  surface?: string;
}

function ArrowCap({
  cap,
  stroke,
  strokeWidth,
  surface,
}: {
  cap: ArrowCapGeometry;
  stroke: string;
  strokeWidth: number;
  surface: string;
}) {
  if (cap.d === '') return null;
  return (
    <path
      d={cap.d}
      // An open cap is a pen stroke and encloses nothing; a closed one is a
      // shape, filled with the line colour or with the canvas behind it.
      fill={cap.closed ? (cap.filled ? stroke : surface) : 'none'}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    />
  );
}

export function StudioArrowView({
  arrow,
  geometry,
  stroke,
  strokeWidth,
  surface = DEFAULT_SURFACE,
}: StudioArrowViewProps) {
  const color = stroke ?? arrowStrokeColor(arrow);
  const width = strokeWidth ?? arrowStrokeWidth(arrow);
  const fontSize = arrowFontSize(arrow);

  return (
    <>
      <path
        data-testid="studio-arrow"
        d={geometry.d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
        // Dash geometry scales with the stroke, so a thick dotted arrow still
        // reads as dots — the same helper edges and paths already use.
        {...diagramEdgeDash(arrow, width)}
      />
      <ArrowCap cap={geometry.start} stroke={color} strokeWidth={width} surface={surface} />
      <ArrowCap cap={geometry.end} stroke={color} strokeWidth={width} surface={surface} />
      {arrow.label ? (
        <text
          x={geometry.label.x}
          y={geometry.label.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={arrow.labelColor ? DIAGRAM_STROKE_COLORS[arrow.labelColor] : DIAGRAM_LABEL_INK}
          // A halo in the canvas colour, so a label sitting on its own line
          // stays readable without a backing rectangle to keep in step.
          stroke={surface}
          strokeWidth={4}
          paintOrder="stroke"
          style={{
            fontSize: `${fontSize}px`,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: arrow.labelBold ? 700 : 400,
          }}
          pointerEvents="none"
        >
          {arrow.label}
        </text>
      ) : null}
    </>
  );
}

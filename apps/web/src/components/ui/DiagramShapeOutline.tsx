import type { DiagramNodeShape, DiagramNodeSize } from '@roundtable/shared';
import { diagramCylinderCapHeight } from '@roundtable/shared';

export interface DiagramShapeOutlineProps {
  shape: DiagramNodeShape;
  size: DiagramNodeSize;
  fill: string;
  stroke: string;
  strokeWidth: number;
  /**
   * Dash pattern for the container border. The editor and the board card drew
   * it at different densities before the shape palette existed, so each passes
   * its own rather than silently repainting old diagrams.
   */
  containerDashArray: string;
}

/**
 * One shape's outline in node-local coordinates, shared by the diagram editor
 * and the pinboard card so a primitive can never render differently in the two
 * places. Edge anchors for these same shapes come from `diagramBoundaryScale`.
 */
export function DiagramShapeOutline({
  shape,
  size,
  fill,
  stroke,
  strokeWidth,
  containerDashArray,
}: DiagramShapeOutlineProps) {
  const { width, height } = size;
  const common = { fill, stroke, strokeWidth };

  switch (shape) {
    case 'ellipse':
      return <ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} {...common} />;

    case 'diamond':
      return (
        <path
          d={`M${width / 2},0 L${width},${height / 2} L${width / 2},${height} L0,${height / 2} Z`}
          {...common}
        />
      );

    case 'triangle':
      return <path d={`M${width / 2},0 L${width},${height} L0,${height} Z`} {...common} />;

    case 'cylinder': {
      const cap = diagramCylinderCapHeight(height);
      return (
        <>
          <path
            d={`M0,${cap} A${width / 2},${cap} 0 0 1 ${width},${cap} L${width},${height - cap} A${width / 2},${cap} 0 0 1 0,${height - cap} Z`}
            {...common}
          />
          {/* Front edge of the top rim; the silhouette alone cannot show it. */}
          <path
            d={`M0,${cap} A${width / 2},${cap} 0 0 0 ${width},${cap}`}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </>
      );
    }

    case 'rectangle':
      return <rect width={width} height={height} {...common} />;

    case 'container':
      return (
        <rect
          width={width}
          height={height}
          rx={3}
          {...common}
          strokeDasharray={containerDashArray}
        />
      );

    case 'text':
      // Text carries no border; a fill only appears once one is chosen.
      return <rect width={width} height={height} fill={fill} />;

    default:
      return <rect width={width} height={height} rx={8} {...common} />;
  }
}

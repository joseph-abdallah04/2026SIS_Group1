import { Type } from 'lucide-react';
import { diagramNodeSize, type DiagramNodeShape } from '@roundtable/shared';

import { DiagramShapeOutline } from '../../../components/ui/DiagramShapeOutline';

/** The box every thumbnail is fitted into, in CSS pixels. */
const BOX = { width: 18, height: 14 };

/**
 * A shape, drawn small, from the same outline the canvas draws it with.
 *
 * The palette and the pickers used to show icons from an icon set, which only
 * resembled the shapes — a "database" glyph for the cylinder, a rounded square
 * for a rounded rectangle twice as wide as it is tall. Drawing the real outline
 * at the shape's real proportions means what is picked is what appears.
 *
 * A text box has no outline of its own to draw, so it keeps its letter.
 */
export function ShapeThumbnail({ shape }: { shape: DiagramNodeShape }) {
  if (shape === 'text') return <Type aria-hidden="true" size={14} />;
  const natural = diagramNodeSize(shape);
  // Fitted inside the box with its own proportions, less the stroke.
  const scale = Math.min((BOX.width - 2) / natural.width, (BOX.height - 2) / natural.height);
  const size = { width: natural.width * scale, height: natural.height * scale };
  return (
    <svg
      aria-hidden="true"
      width={BOX.width}
      height={BOX.height}
      viewBox={`0 0 ${BOX.width} ${BOX.height}`}
      className="shrink-0"
    >
      <g
        transform={`translate(${(BOX.width - size.width) / 2}, ${(BOX.height - size.height) / 2}) scale(${scale})`}
      >
        <DiagramShapeOutline
          shape={shape}
          size={natural}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4 / scale}
          containerDashArray={`${3 / scale} ${2 / scale}`}
        />
      </g>
    </svg>
  );
}

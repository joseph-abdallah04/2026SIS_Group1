import { drawingArtifactSchema } from '@roundtable/shared/schemas';
import { describe, expect, it } from 'vitest';

import { DRAWING_SVG_LIMIT } from '../artifactLimits';
import {
  DRAWING_VIEWBOX_HEIGHT,
  DRAWING_VIEWBOX_WIDTH,
  clientPointToDrawingPoint,
  eraserRadiusForSurface,
  eraseStrokesAtPoint,
  prepareDrawing,
  serializeDrawingSvg,
  simplifyStroke,
  type DrawingStroke,
} from './drawingModel';

const horizontalStroke: DrawingStroke = {
  id: 'stroke-1',
  ink: 'ink',
  width: 8,
  points: [
    { x: 10, y: 20 },
    { x: 20, y: 20.1 },
    { x: 30, y: 19.9 },
    { x: 40, y: 20 },
  ],
};

describe('drawing model', () => {
  it('simplifies pointer jitter while preserving both endpoints', () => {
    const simplified = simplifyStroke(horizontalStroke.points);

    expect(simplified.length).toBeLessThan(horizontalStroke.points.length);
    expect(simplified[0]).toEqual(horizontalStroke.points[0]);
    expect(simplified.at(-1)).toEqual(horizontalStroke.points.at(-1));
  });

  it('erases a complete stroke when the eraser crosses a segment', () => {
    const untouched: DrawingStroke = {
      ...horizontalStroke,
      id: 'stroke-2',
      points: [
        { x: 10, y: 100 },
        { x: 40, y: 100 },
      ],
    };

    expect(eraseStrokesAtPoint([horizontalStroke, untouched], { x: 25, y: 22 })).toEqual([
      untouched,
    ]);
  });

  it('serializes a transparent fixed-viewBox SVG accepted by the shared contract', () => {
    const svg = serializeDrawingSvg([horizontalStroke]);
    const parsed = drawingArtifactSchema.safeParse({ type: 'drawing', svg });

    expect(parsed.success).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${DRAWING_VIEWBOX_WIDTH} ${DRAWING_VIEWBOX_HEIGHT}"`);
    expect(svg).toContain('<path');
    expect(svg).not.toContain('<rect');
    expect(svg.length).toBeLessThan(DRAWING_SVG_LIMIT);
  });

  it('mirrors the shared SVG size boundary', () => {
    expect(
      drawingArtifactSchema.safeParse({
        type: 'drawing',
        svg: 'x'.repeat(DRAWING_SVG_LIMIT),
      }).success,
    ).toBe(true);
    expect(
      drawingArtifactSchema.safeParse({
        type: 'drawing',
        svg: 'x'.repeat(DRAWING_SVG_LIMIT + 1),
      }).success,
    ).toBe(false);
  });

  it('rejects an empty drawing', () => {
    expect(prepareDrawing([])).toEqual({
      ok: false,
      error: 'Draw something before proposing this sketch.',
    });
  });

  it('serializes a tap as a visible round mark', () => {
    const svg = serializeDrawingSvg([
      {
        ...horizontalStroke,
        points: [{ x: 25, y: 30 }],
      },
    ]);

    expect(svg).toContain('M 25 30 l 0.1 0');
    expect(svg).toContain('stroke-linecap="round"');
  });

  it('blocks a drawing that exceeds the shared artifact limit', () => {
    const detailedDrawing = Array.from({ length: 1200 }, (_, index) => ({
      ...horizontalStroke,
      id: `stroke-${index}`,
      points: [
        { x: index % DRAWING_VIEWBOX_WIDTH, y: 0 },
        { x: (index * 3) % DRAWING_VIEWBOX_WIDTH, y: DRAWING_VIEWBOX_HEIGHT },
      ],
    }));

    expect(prepareDrawing(detailedDrawing)).toEqual({
      ok: false,
      error: 'This sketch is too detailed to propose. Undo a few strokes and try again.',
    });
  });

  it('rounds coordinates so pointer noise does not inflate the artifact', () => {
    const svg = serializeDrawingSvg([
      {
        ...horizontalStroke,
        points: [
          { x: 10.12345, y: 20.98765 },
          { x: 40.55555, y: 60.44444 },
        ],
      },
    ]);

    expect(svg).toContain('M 10.1 21');
    expect(svg).toContain('L 40.6 60.4');
    expect(svg).not.toContain('10.12345');
  });

  it('maps a scaled browser surface into the fixed drawing viewBox', () => {
    expect(
      clientPointToDrawingPoint({ x: 410, y: 270 }, { left: 50, top: 20, width: 720, height: 500 }),
    ).toEqual({ x: 360, y: 250 });
  });

  it('clamps pointer coordinates that leave the drawing surface', () => {
    expect(
      clientPointToDrawingPoint({ x: -50, y: 900 }, { left: 0, top: 0, width: 360, height: 250 }),
    ).toEqual({ x: 0, y: DRAWING_VIEWBOX_HEIGHT });
  });

  it('keeps the eraser hit target constant when the surface scales down', () => {
    expect(
      eraserRadiusForSurface({
        left: 0,
        top: 0,
        width: DRAWING_VIEWBOX_WIDTH,
        height: DRAWING_VIEWBOX_HEIGHT,
      }),
    ).toBe(12);
    expect(
      eraserRadiusForSurface({
        left: 0,
        top: 0,
        width: DRAWING_VIEWBOX_WIDTH / 2,
        height: DRAWING_VIEWBOX_HEIGHT / 2,
      }),
    ).toBe(24);
  });
});

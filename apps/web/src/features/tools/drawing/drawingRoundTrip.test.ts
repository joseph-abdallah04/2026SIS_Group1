import { describe, expect, it } from 'vitest';
import { drawingWriteArtifactSchema } from '@roundtable/shared/schemas';

import { dataToStrokes, prepareDrawing, serializeDrawingSvg, strokesToData } from './drawingModel';
import type { DrawingStroke } from './drawingModel';

function stroke(overrides: Partial<DrawingStroke> = {}): DrawingStroke {
  return {
    id: 's1',
    ink: 'ocean',
    width: 8,
    points: [
      { x: 10, y: 10 },
      { x: 40, y: 62.34 },
      { x: 120, y: 30 },
    ],
    ...overrides,
  };
}

describe('drawing round trip', () => {
  // The point of storing strokes: what comes back must draw the same picture,
  // or editing silently alters the artwork the author approved.
  it('renders identically after a save and reopen', () => {
    const original = [stroke(), stroke({ id: 's2', ink: 'gold', width: 14 })];
    const reopened = dataToStrokes(strokesToData(original));

    expect(serializeDrawingSvg(reopened)).toBe(serializeDrawingSvg(original));
  });

  it('survives repeated edit cycles without drifting', () => {
    let strokes = [
      stroke({
        points: [
          { x: 1.04, y: 2.06 },
          { x: 300.5, y: 400.5 },
        ],
      }),
    ];
    const first = serializeDrawingSvg(dataToStrokes(strokesToData(strokes)));

    for (let i = 0; i < 5; i += 1) strokes = dataToStrokes(strokesToData(strokes));

    expect(serializeDrawingSvg(strokes)).toBe(first);
  });

  it('keeps every pen and colour a stroke was drawn with', () => {
    const original = [
      stroke({ id: 'a', ink: 'ink', width: 4 }),
      stroke({ id: 'b', ink: 'rose', width: 14 }),
    ];
    const reopened = dataToStrokes(strokesToData(original));

    expect(reopened.map((s) => [s.ink, s.width])).toEqual([
      ['ink', 4],
      ['rose', 14],
    ]);
  });

  it('drops strokes with no points, as the renderer already does', () => {
    expect(strokesToData([stroke({ points: [] }), stroke({ id: 's2' })])).toHaveLength(1);
  });

  it('produces an artifact the server will accept', () => {
    const prepared = prepareDrawing([stroke()]);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const parsed = drawingWriteArtifactSchema.safeParse({
      type: 'drawing',
      svg: prepared.svg,
      strokes: prepared.strokes,
    });
    expect(parsed.success).toBe(true);
  });

  // Both halves share one budget, so the editor has to measure them together
  // or it will offer to propose something the server then refuses.
  it('refuses a sketch whose svg and strokes together exceed the budget', () => {
    // Points that zig-zag, so simplification cannot collapse them — a smooth
    // line would be reduced away and never approach the limit.
    const dense = (id: string): DrawingStroke =>
      stroke({
        id,
        points: Array.from({ length: 2000 }, (_, i) => ({ x: (i * 37) % 700, y: (i * 53) % 490 })),
      });
    const prepared = prepareDrawing(Array.from({ length: 10 }, (_, i) => dense(`s${i}`)));

    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.error).toMatch(/too detailed/);
  });

  // The strokes are stored beside the SVG, so they have to be cheap. Packed as
  // flat numbers they cost roughly a third of the rendering they accompany;
  // as {x, y} objects they would cost more than it.
  it('adds well under the rendering it accompanies', () => {
    const drawn = Array.from({ length: 4 }, (_, i) =>
      stroke({
        id: `s${i}`,
        points: Array.from({ length: 500 }, (_, n) => ({ x: (n * 37) % 700, y: (n * 53) % 490 })),
      }),
    );
    const svg = serializeDrawingSvg(drawn).length;
    const strokes = JSON.stringify(strokesToData(drawn)).length;

    expect(strokes).toBeLessThan(svg * 0.6);
  });

  it('stores the simplified stroke, not every raw sample', () => {
    const dense = stroke({
      points: Array.from({ length: 200 }, (_, i) => ({ x: 100 + i * 0.01, y: 100 })),
    });
    const [stored] = strokesToData([dense]);

    expect(stored!.points.length).toBeLessThan(dense.points.length * 2);
  });
});

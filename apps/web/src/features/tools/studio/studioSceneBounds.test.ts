import {
  diagramExtent,
  pathPaintedBounds,
  studioSceneBounds,
  type PathElement,
  type StudioScene,
} from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

/** A canvas holding only what a test puts on it. */
function scene(parts: Partial<StudioScene>): StudioScene {
  return { nodes: [], edges: [], ...parts };
}

// A canvas is framed — on its card, in an export, in the recap — by what it
// paints. Framing by what elements store cropped anything turned, and any
// label set beside a line.
describe('studioSceneBounds measures what a canvas paints', () => {
  it('frames an unturned shape by its own box, as it always has', () => {
    expect(
      studioSceneBounds(
        scene({
          nodes: [{ id: 'n', label: 'A', x: 100, y: 100, shape: 'box', width: 120, height: 56 }],
        }),
      ),
    ).toEqual({ x: 100, y: 100, width: 120, height: 56 });
  });

  it('reaches past a shape turned on its side', () => {
    const bounds = studioSceneBounds(
      scene({
        nodes: [
          {
            id: 'n',
            label: 'A',
            x: 100,
            y: 100,
            shape: 'box',
            width: 120,
            height: 56,
            rotation: 90,
          },
        ],
      }),
    );
    // A 120×56 box stood on end paints 32 units above and below its stored box.
    expect(bounds.y).toBeCloseTo(68);
    expect(bounds.height).toBeCloseTo(120);
    expect(bounds.x).toBeCloseTo(132);
    expect(bounds.width).toBeCloseTo(56);
  });

  it('gives a level sketch turned upright the height it now has', () => {
    const level = scene({ ink: [{ id: 'i', points: [100, 200, 200, 200] }] });
    const upright = scene({ ink: [{ id: 'i', points: [100, 200, 200, 200], rotation: 90 }] });

    expect(studioSceneBounds(level).height).toBe(0);
    expect(studioSceneBounds(upright).height).toBeCloseTo(100);
  });

  it('measures a turned pen line the way its own painted bounds do', () => {
    const path: PathElement = {
      id: 'p',
      anchors: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
      ],
      rotation: 45,
    };
    expect(studioSceneBounds(scene({ paths: [path] }))).toEqual(pathPaintedBounds(path));
  });

  it("takes in a large label set off an arrow's line", () => {
    const plain = scene({
      arrows: [{ id: 'a', from: { x: 100, y: 200 }, to: { x: 400, y: 200 } }],
    });
    const labelled = scene({
      arrows: [
        {
          id: 'a',
          from: { x: 100, y: 200 },
          to: { x: 400, y: 200 },
          label: 'Ships first',
          fontSizePreset: 'xlarge',
          labelSide: 'above',
        },
      ],
    });

    expect(studioSceneBounds(plain).height).toBe(0);
    // A 30-unit label set above the line sits 23 units off it, centred there,
    // so its letters reach well over a label's height above the route.
    expect(studioSceneBounds(labelled).y).toBeLessThan(200 - 30);
  });

  it("takes in a connector's label that is wider than the shapes it joins", () => {
    const nodes = [
      { id: 'a', label: 'A', x: 100, y: 100, shape: 'box' as const, width: 120, height: 56 },
      { id: 'b', label: 'B', x: 100, y: 300, shape: 'box' as const, width: 120, height: 56 },
    ];
    const without = studioSceneBounds(scene({ nodes, edges: [{ from: 'a', to: 'b' }] }));
    const withLabel = studioSceneBounds(
      scene({
        nodes,
        edges: [{ from: 'a', to: 'b', label: 'a much longer label than either box is wide' }],
      }),
    );

    expect(withLabel.width).toBeGreaterThan(without.width);
  });

  it("takes in a label sat on an arrow's line, which still reaches either side of it", () => {
    const bounds = studioSceneBounds(
      scene({
        arrows: [
          {
            id: 'a',
            from: { x: 100, y: 200 },
            to: { x: 400, y: 200 },
            label: 'On it',
            fontSizePreset: 'xlarge',
          },
        ],
      }),
    );
    expect(bounds.y).toBeLessThan(200 - 15);
    expect(bounds.y + bounds.height).toBeGreaterThan(200 + 15);
  });
});

describe('diagramExtent', () => {
  it('starts at the sheet corner for a canvas that stays on the sheet', () => {
    const extent = diagramExtent(
      scene({ nodes: [{ id: 'n', label: 'A', x: 40, y: 40, shape: 'box' }] }),
    );
    expect(extent.x).toBe(0);
    expect(extent.y).toBe(0);
  });

  it('starts above the sheet when a turned shape paints above it, so nothing is cut off', () => {
    const extent = diagramExtent(
      scene({
        nodes: [
          { id: 'n', label: 'A', x: 0, y: 0, shape: 'box', width: 120, height: 56, rotation: 90 },
        ],
      }),
    );
    expect(extent.y).toBeLessThanOrEqual(-32);
    // The frame still reaches the far edge, plus the card's margin.
    expect(extent.y + extent.height).toBeGreaterThanOrEqual(56 + 32 + 24);
  });
});

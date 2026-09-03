import type { DiagramNode } from '@roundtable/shared';
import {
  DIAGRAM_EDGE_STROKE_WIDTHS,
  DIAGRAM_FILL_COLORS,
  DIAGRAM_FONT_SIZES,
  DIAGRAM_LABEL_INK,
  DIAGRAM_LEGACY_EDGE_STROKE,
  DIAGRAM_MAX_NODE_HEIGHT,
  DIAGRAM_MAX_NODE_WIDTH,
  DIAGRAM_MIN_NODE_HEIGHT,
  DIAGRAM_MIN_NODE_WIDTH,
  DIAGRAM_NODE_STROKE_WIDTHS,
  DIAGRAM_STROKE_COLORS,
  diagramEdgeDash,
  diagramEdgeGeometry,
  diagramEdgeStroke,
  diagramEdgeStrokeWidth,
  diagramNodeFill,
  diagramNodeFontSize,
  diagramNodeLabelLayout,
  diagramNodeSize,
  diagramNodeStroke,
  diagramNodeStrokeWidth,
  effectiveDiagramNodeSize,
  wrapDiagramLabel,
} from '@roundtable/shared';
import { diagramWriteArtifactSchema } from '@roundtable/shared/schemas';
import { describe, expect, it } from 'vitest';

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const CANVAS_WHITE = '#FFFFFF';

describe('diagram palette accessibility', () => {
  // WCAG 1.4.3: label text on any offered fill.
  it.each(Object.entries(DIAGRAM_FILL_COLORS))(
    'keeps label ink readable on the %s fill',
    (_key, fill) => {
      expect(contrastRatio(fill, DIAGRAM_LABEL_INK)).toBeGreaterThanOrEqual(4.5);
    },
  );

  // WCAG 1.4.11: borders and arrows are graphical objects, not text.
  it.each(Object.entries(DIAGRAM_STROKE_COLORS))(
    'keeps the %s stroke visible on the bare canvas',
    (_key, stroke) => {
      expect(contrastRatio(stroke, CANVAS_WHITE)).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(Object.entries(DIAGRAM_STROKE_COLORS))(
    'keeps the %s stroke visible on every offered fill',
    (_key, stroke) => {
      for (const fill of Object.values(DIAGRAM_FILL_COLORS)) {
        expect(contrastRatio(stroke, fill)).toBeGreaterThanOrEqual(3);
      }
    },
  );
});

describe('style resolvers', () => {
  const legacyBox: DiagramNode = { id: 'n1', label: 'Client', x: 0, y: 0, shape: 'box' };

  it('leaves a pre-v2 node looking exactly as it did', () => {
    expect(diagramNodeFill(legacyBox)).toBe('#EEF2F4');
    expect(diagramNodeFill({ shape: 'container' })).toBe('#FAFAFA');
    expect(diagramNodeFill({ shape: 'text' })).toBe('transparent');
    // A shapeless legacy node is a box.
    expect(diagramNodeFill({})).toBe('#EEF2F4');

    // Each surface keeps its own original border colour and width.
    expect(diagramNodeStroke(legacyBox, '#4D6A74')).toBe('#4D6A74');
    expect(diagramNodeStroke(legacyBox, '#8CA4AC')).toBe('#8CA4AC');
    expect(diagramNodeStrokeWidth(legacyBox, 1.5)).toBe(1.5);
    expect(diagramNodeStrokeWidth(legacyBox, 1)).toBe(1);
    expect(diagramNodeFontSize(legacyBox)).toBe(11);

    expect(diagramEdgeStroke({})).toBe(DIAGRAM_LEGACY_EDGE_STROKE);
    expect(diagramEdgeStrokeWidth({}, 2)).toBe(2);
    expect(diagramEdgeDash({}, 2)).toEqual({});
  });

  it('resolves every chosen preset from the shared tables', () => {
    expect(diagramNodeFill({ ...legacyBox, fillColor: 'violet' })).toBe(DIAGRAM_FILL_COLORS.violet);
    expect(diagramNodeStroke({ ...legacyBox, strokeColor: 'rose' }, '#4D6A74')).toBe(
      DIAGRAM_STROKE_COLORS.rose,
    );
    expect(diagramNodeStrokeWidth({ ...legacyBox, strokeWidthPreset: 'thick' }, 1)).toBe(
      DIAGRAM_NODE_STROKE_WIDTHS.thick,
    );
    expect(diagramNodeFontSize({ ...legacyBox, fontSizePreset: 'large' })).toBe(
      DIAGRAM_FONT_SIZES.large,
    );
    expect(diagramEdgeStrokeWidth({ strokeWidthPreset: 'thin' }, 2)).toBe(
      DIAGRAM_EDGE_STROKE_WIDTHS.thin,
    );
  });

  it('choosing the regular preset changes nothing the editor was already drawing', () => {
    expect(DIAGRAM_NODE_STROKE_WIDTHS.regular).toBe(1.5);
    expect(DIAGRAM_EDGE_STROKE_WIDTHS.regular).toBe(2);
    expect(DIAGRAM_FONT_SIZES.medium).toBe(11);
  });

  it('scales dash geometry with the stroke and rounds dotted caps', () => {
    expect(diagramEdgeDash({ strokeStyle: 'solid' }, 2)).toEqual({});
    expect(diagramEdgeDash({ strokeStyle: 'dashed' }, 2).strokeDasharray).toBe('6 4');
    expect(diagramEdgeDash({ strokeStyle: 'dashed' }, 3.5).strokeDasharray).toBe('10.5 7');
    expect(diagramEdgeDash({ strokeStyle: 'dotted' }, 2)).toEqual({
      strokeDasharray: '0.01 5',
      strokeLinecap: 'round',
    });
  });
});

describe('effective node size', () => {
  it('falls back to the fixed shape size when no size is stored', () => {
    expect(effectiveDiagramNodeSize({ shape: 'box' })).toEqual(diagramNodeSize('box'));
    expect(effectiveDiagramNodeSize({})).toEqual(diagramNodeSize(undefined));
  });

  it('uses the stored pair once both dimensions are present', () => {
    expect(effectiveDiagramNodeSize({ shape: 'box', width: 200, height: 90 })).toEqual({
      width: 200,
      height: 90,
    });
  });

  it('ignores a half-written size rather than guessing the other dimension', () => {
    expect(effectiveDiagramNodeSize({ shape: 'box', width: 200 })).toEqual(diagramNodeSize('box'));
  });

  it('anchors arrows on the resized boundary, not the shape default', () => {
    const from: DiagramNode = { id: 'a', label: 'A', x: 0, y: 0, shape: 'box' };
    const to: DiagramNode = { id: 'b', label: 'B', x: 400, y: 0, shape: 'box' };

    const legacy = diagramEdgeGeometry(from, to);
    const widened = diagramEdgeGeometry({ ...from, width: 240, height: 56 }, to);

    expect(legacy.x1).toBe(120);
    expect(widened.x1).toBe(240);
    // The destination anchor is untouched by the source's resize.
    expect(widened.x2).toBe(legacy.x2);
  });
});

describe('label layout', () => {
  it('keeps a short label on one line at the pre-v2 baseline', () => {
    const layout = diagramNodeLabelLayout({ label: 'Client', shape: 'box' });
    expect(layout.lines).toEqual(['Client']);
    expect(layout.fontSize).toBe(11);
    // 56 / 2 + 4, exactly what the editor and card drew before v2.
    expect(layout.firstBaselineY).toBe(32);
  });

  it('wraps a long label instead of letting it overflow the node', () => {
    const layout = diagramNodeLabelLayout({ label: 'Payment reconciliation', shape: 'box' });
    expect(layout.lines.length).toBeGreaterThan(1);
    for (const line of layout.lines) expect(line.length).toBeLessThanOrEqual(17);
    // Extra lines are centred on the same optical centre.
    expect(layout.firstBaselineY).toBeLessThan(32);
  });

  it('never exceeds the line budget and never spills past the node height', () => {
    const layout = diagramNodeLabelLayout({
      label: 'aaaa bbbb cccc dddd eeee ffff',
      shape: 'box',
      width: 56,
      height: 32,
    });
    expect(layout.lines.length).toBeLessThanOrEqual(3);
    expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(32);
    expect(layout.lines.at(-1)).toMatch(/…$/);
  });

  it('hard-breaks a single word that cannot fit the line', () => {
    // (56 - 12 padding) / (11 * 0.55) = 7 characters per line.
    expect(wrapDiagramLabel('supercalifragilistic', 56, 11)).toEqual([
      'superca',
      'lifragi',
      'listic',
    ]);
  });

  it('returns no lines for an empty label', () => {
    expect(wrapDiagramLabel('   ', 120, 11)).toEqual([]);
  });

  it('fits more text per line as the node widens', () => {
    const narrow = wrapDiagramLabel('one two three four five', 120, 11);
    const wide = wrapDiagramLabel('one two three four five', 400, 11);
    expect(wide.length).toBeLessThan(narrow.length);
  });
});

describe('write contract v2', () => {
  function artifact(node: Partial<DiagramNode>) {
    return {
      type: 'diagram' as const,
      nodes: [{ id: 'n1', label: 'A', x: 0, y: 0, shape: 'box' as const, ...node }],
      edges: [],
    };
  }

  it('accepts a fully styled and resized node', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact({
        width: 200,
        height: 90,
        fillColor: 'blue',
        strokeColor: 'slate',
        strokeWidthPreset: 'thick',
        fontSizePreset: 'large',
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it('accepts a pre-v2 node carrying none of the new fields', () => {
    expect(diagramWriteArtifactSchema.safeParse(artifact({})).success).toBe(true);
  });

  it('rejects a half-written size in either direction', () => {
    expect(diagramWriteArtifactSchema.safeParse(artifact({ width: 200 })).success).toBe(false);
    expect(diagramWriteArtifactSchema.safeParse(artifact({ height: 90 })).success).toBe(false);
  });

  it('rejects a size outside the bounds', () => {
    expect(
      diagramWriteArtifactSchema.safeParse(
        artifact({ width: DIAGRAM_MIN_NODE_WIDTH - 1, height: 90 }),
      ).success,
    ).toBe(false);
    expect(
      diagramWriteArtifactSchema.safeParse(
        artifact({ width: DIAGRAM_MAX_NODE_WIDTH + 1, height: 90 }),
      ).success,
    ).toBe(false);
    expect(
      diagramWriteArtifactSchema.safeParse(
        artifact({ width: 200, height: DIAGRAM_MIN_NODE_HEIGHT - 1 }),
      ).success,
    ).toBe(false);
    expect(
      diagramWriteArtifactSchema.safeParse(
        artifact({ width: 200, height: DIAGRAM_MAX_NODE_HEIGHT + 1 }),
      ).success,
    ).toBe(false);
  });

  it('rejects a colour outside the closed palette', () => {
    expect(
      diagramWriteArtifactSchema.safeParse(artifact({ fillColor: '#ff0000' as never })).success,
    ).toBe(false);
    expect(
      diagramWriteArtifactSchema.safeParse(artifact({ strokeColor: 'chartreuse' as never }))
        .success,
    ).toBe(false);
  });

  it('rejects an edge style outside the closed set', () => {
    const parsed = diagramWriteArtifactSchema.safeParse({
      type: 'diagram',
      nodes: [
        { id: 'n1', label: 'A', x: 0, y: 0 },
        { id: 'n2', label: 'B', x: 200, y: 0 },
      ],
      edges: [{ from: 'n1', to: 'n2', strokeStyle: 'wavy' }],
    });
    expect(parsed.success).toBe(false);
  });
});

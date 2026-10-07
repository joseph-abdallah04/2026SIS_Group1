import type { BoardItem, DiagramArtifact } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { rasterizeProposalPreview } from './artifactPreview.js';
import { studioSceneMarkup } from './studioSceneSvg.js';

function item(artifactJson: DiagramArtifact): BoardItem {
  return {
    id: 'p1',
    questionId: 'q1',
    authorId: 'u2',
    authorName: 'Ada',
    type: 'diagram',
    artifactJson,
    x: 0,
    y: 0,
    createdAt: '2026-09-01T01:10:00.000Z',
    z: 0,
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
    reactions: [],
  };
}

/** One of everything a studio canvas can hold. */
const FULL_SCENE: DiagramArtifact = {
  type: 'diagram',
  nodes: [
    { id: 'n1', label: 'Turned', x: 40, y: 40, shape: 'box', rotation: 30 },
    { id: 'n2', label: 'Right <b>', x: 260, y: 40, shape: 'ellipse', labelAlign: 'right' },
  ],
  edges: [{ from: 'n1', to: 'n2', label: 'edge' }],
  ink: [{ id: 'i1', points: [20, 200, 60, 220, 100, 210], strokeColor: 'rose' }],
  paths: [
    {
      id: 'p1',
      anchors: [
        { x: 200, y: 200 },
        { x: 260, y: 260 },
        { x: 200, y: 260 },
      ],
      closed: true,
      fillColor: 'amber',
      rotation: 15,
    },
  ],
  tables: [
    {
      id: 't1',
      x: 40,
      y: 300,
      colWidths: [96, 96],
      rowHeights: [32, 32],
      cells: [{ text: 'Head' }, { text: 'Two', bold: true }, { text: 'A & B' }, {}],
      headerRow: true,
    },
  ],
  arrows: [
    {
      id: 'a1',
      from: { x: 0, y: 0, elementId: 'n1' },
      to: { x: 400, y: 400 },
      label: 'free',
      labelBold: true,
    },
  ],
};

describe('studioSceneMarkup', () => {
  const markup = studioSceneMarkup(FULL_SCENE, 'p1');

  it('draws every kind of element, not only shapes and connectors', () => {
    // Ink, the pen path, the table's clip and grid, and the free arrow's label.
    expect(markup).toContain('stroke-linecap="round"');
    expect(markup).toMatch(/<path transform="rotate\(15 [^"]+\)"/);
    expect(markup).toContain('<clipPath id="rt-pdf-table-p1-1">');
    expect(markup).toContain('>Head</tspan>');
    expect(markup).toContain('>free</tspan>');
    expect(markup).toContain('marker-end="url(#rt-pdf-arrow-p1-');
  });

  it('turns a rotated shape about its own centre', () => {
    expect(markup).toMatch(/translate\(40, 40\) rotate\(30 [\d.]+ [\d.]+\)/);
  });

  it('places a label where its alignment puts it', () => {
    expect(markup).toContain('text-anchor="end"');
  });

  it('escapes what members typed', () => {
    expect(markup).toContain('Right &lt;b&gt;');
    expect(markup).toContain('A &amp; B');
    expect(markup).not.toContain('<b>');
  });

  it('keeps ids apart between canvases in one document', () => {
    expect(studioSceneMarkup(FULL_SCENE, 'other"id')).toContain('rt-pdf-table-otherid-1');
  });
});

describe('studioSceneMarkup tables with merged cells', () => {
  // The top row's two cells merged into one heading; the cell it covers still
  // holds text from before the merge, which must not show through.
  const markup = studioSceneMarkup(
    {
      nodes: [],
      edges: [],
      tables: [
        {
          id: 't',
          x: 0,
          y: 0,
          colWidths: [96, 96],
          rowHeights: [32, 32],
          cells: [{ text: 'Heading' }, { text: 'Covered' }, { text: 'A' }, { text: 'B' }],
          merges: [{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }],
        },
      ],
    },
    'm',
  );

  it('fills a merged cell once, across everything it spans', () => {
    const fills = [...markup.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)];
    expect(fills.map((fill) => fill.slice(1).join(' '))).toEqual([
      '0 0 192 32',
      '0 32 96 32',
      '96 32 96 32',
    ]);
  });

  it('draws no grid line through the merged cell', () => {
    // The column line starts below the merged row; the row line runs across.
    expect(markup).toContain('d="M96 32V64M0 32H192"');
  });

  it("shows the merged cell's text and never the text it covers", () => {
    expect(markup).toContain('>Heading</tspan>');
    expect(markup).not.toContain('Covered');
  });
});

describe('rasterizeProposalPreview for a studio canvas', () => {
  it('draws a brainstorm idea (F41) in its plain frame, sketches and all', () => {
    const png = rasterizeProposalPreview(item(FULL_SCENE), 'idea');
    expect(png.png.subarray(1, 4).toString()).toBe('PNG');
  });

  it('rasterizes a canvas holding every kind of element', () => {
    const png = rasterizeProposalPreview(item(FULL_SCENE), 'winner');
    expect(png.png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.width).toBe(1400);
  });

  it('draws a sketch-only canvas rather than an empty plate', () => {
    const sketchOnly: DiagramArtifact = {
      type: 'diagram',
      nodes: [],
      edges: [],
      ink: [{ id: 'i1', points: [20, 20, 400, 300] }],
    };
    const sketched = rasterizeProposalPreview(item(sketchOnly), 'winner');
    const empty = rasterizeProposalPreview(
      item({ type: 'diagram', nodes: [], edges: [] }),
      'winner',
    );
    // The empty plate is a fixed 280 units tall; a drawn canvas takes its own
    // shape, so the two cannot come out the same size.
    expect(sketched.height).not.toBe(empty.height);
  });
});

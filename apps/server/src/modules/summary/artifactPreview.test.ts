import type { BoardItem, DiagramArtifact, DrawingArtifact } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { rasterizeProposalPreview } from './artifactPreview.js';

function item(artifactJson: BoardItem['artifactJson']): BoardItem {
  return {
    id: 'p1',
    questionId: 'q1',
    authorId: 'u2',
    authorName: 'Ada',
    type: artifactJson.type,
    artifactJson,
    x: 0,
    y: 0,
    createdAt: '2026-09-01T01:10:00.000Z',
    extendsProposalId: null,
    reactions: [],
  };
}

function drawing(svg: string): DrawingArtifact {
  return { type: 'drawing', svg };
}

function diagramAt(y: number): DiagramArtifact {
  return {
    type: 'diagram',
    nodes: [{ id: 'n1', label: 'One', x: 0, y, shape: 'box' }],
    edges: [],
  };
}

// Geometry in a stored artifact is member-authored: a drawing brings its own
// viewBox and `diagramNodeSchema` puts no bounds on a node's x/y. The recap
// renders whatever won a vote, so the rasterizer has to stay bounded on input
// nobody vetted.
describe('rasterizeProposalPreview', () => {
  it('renders a normal drawing at its own aspect ratio', () => {
    const png = rasterizeProposalPreview(
      item(drawing('<svg viewBox="0 0 844 480"><path d="M10,10 L100,100" stroke="#000"/></svg>')),
      'winner',
    );
    expect(png.width).toBe(1400);
    // 844x480 art in a 900-wide card: roughly square-ish, nothing like the cap.
    expect(png.height).toBeLessThan(1600);
    expect(png.png.subarray(1, 4).toString()).toBe('PNG');
  });

  it('caps a drawing whose viewBox asks for a billion pixels of height', () => {
    const png = rasterizeProposalPreview(
      item(drawing('<svg viewBox="0 0 1 1000000000"><path d="M0,0 L1,1" stroke="#000"/></svg>')),
      'winner',
    );
    expect(png.height).toBeLessThan(3000);
  });

  it('caps a diagram whose node sits a billion pixels down the canvas', () => {
    const png = rasterizeProposalPreview(item(diagramAt(1_000_000_000)), 'tied');
    expect(png.height).toBeLessThan(3000);
  });

  it('still renders when the drawing carries no usable viewBox', () => {
    const png = rasterizeProposalPreview(
      item(drawing('<svg><path d="M0,0 L10,10" stroke="#000"/></svg>')),
      'winner',
    );
    expect(png.png.subarray(1, 4).toString()).toBe('PNG');
  });
});

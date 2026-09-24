import type {
  BoardItem,
  DiagramArtifact,
  DrawingArtifact,
  ImageArtifact,
} from '@roundtable/shared';
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
    z: 0,
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
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

  // What the importer writes: a JPEG for anything opaque. Made by the importer
  // itself, in a browser, so this is the real encoding and not a hand-made one.
  const RED_JPEG =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAQDAwQDAwQEBAQFBQQFBwsHBwYGBw4KCggLEA4RERAOEA8SFBoWEhMYEw8QFh8XGBsbHR0dERYgIh8cIhocHRz/2wBDAQUFBQcGBw0HBw0cEhASHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBz/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCWgBimH//Z';

  function image(src: string, width = 8, height = 8): ImageArtifact {
    return { type: 'image', src, width, height };
  }

  it('paints an imported picture into the card', () => {
    const png = rasterizeProposalPreview(item(image(RED_JPEG)), 'winner');
    expect(png.png.subarray(1, 4).toString()).toBe('PNG');
  });

  // A picture as tall as it is allowed to be is still held to the recap's
  // ceiling, the same as a drawing or a diagram.
  it('caps a very tall picture', () => {
    const png = rasterizeProposalPreview(item(image(RED_JPEG, 10, 1600)), 'tied');
    // The same ceiling a drawing is held to, rather than a strip 160 times
    // taller than it is wide.
    expect(png.height).toBeLessThan(3000);
  });

  // A row that somehow holds an address is drawn as an empty plate, never
  // handed to resvg to follow.
  it('leaves the plate empty for a picture it cannot vouch for', () => {
    const png = rasterizeProposalPreview(item(image('https://example.com/x.jpg')), 'winner');
    expect(png.png.subarray(1, 4).toString()).toBe('PNG');
  });
});

import type { DiagramNode } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import {
  EXTEND_GAP,
  EXTEND_MIN_GAP,
  extendPosition,
  extendShapeChoices,
  extendSideNormal,
  planExtension,
} from './studioExtend';

// A default rounded rectangle: 120 x 56, centred on (160, 128).
const source: DiagramNode = { id: 'n1', label: 'Start', x: 100, y: 100, shape: 'box' };
const boxSize = { width: 120, height: 56 };

describe('which way a side points', () => {
  it('points straight out of an unturned shape', () => {
    expect(extendSideNormal('e')).toEqual({ x: 1, y: 0 });
    expect(extendSideNormal('n')).toEqual({ x: 0, y: -1 });
  });

  it('turns with the shape', () => {
    const turned = extendSideNormal('e', 90);
    expect(turned.x).toBeCloseTo(0);
    expect(turned.y).toBeCloseTo(1);
  });
});

describe('the shapes offered', () => {
  it('offers the source shape first, then the rest, without a container', () => {
    const choices = extendShapeChoices('diamond');
    expect(choices[0]).toBe('diamond');
    expect(choices).toContain('text');
    expect(choices).not.toContain('container');
    expect(new Set(choices).size).toBe(choices.length);
  });

  it('offers a container only to extend a container', () => {
    expect(extendShapeChoices('container')[0]).toBe('container');
  });
});

describe('where the new shape goes', () => {
  it('sits the full gap away, level with the source, on the side chosen', () => {
    // Right edge at 220, then the gap, then the new shape.
    expect(extendPosition(source, 'e', boxSize)).toEqual({ x: 220 + EXTEND_GAP, y: 100 });
    expect(extendPosition(source, 's', boxSize)).toEqual({ x: 100, y: 156 + EXTEND_GAP });
    const further: DiagramNode = { ...source, x: 300 };
    expect(extendPosition(further, 'w', boxSize)).toEqual({ x: 300 - EXTEND_GAP - 120, y: 100 });
  });

  it('steps past something already there', () => {
    const inTheWay = { x: 284, y: 100, width: 120, height: 56 };
    // One shape and one gap further on.
    expect(extendPosition(source, 'e', boxSize, [inTheWay])).toEqual({ x: 468, y: 100 });
  });

  it('closes the gap near the edge of the sheet', () => {
    // 176 to the right edge: the full gap does not fit, the smaller one does.
    const nearEdge: DiagramNode = { ...source, x: 664 };
    expect(extendPosition(nearEdge, 'e', boxSize)).toEqual({ x: 784 + EXTEND_MIN_GAP, y: 100 });
  });

  it('slides along the edge when even the smaller gap does not fit', () => {
    const atEdge: DiagramNode = { ...source, x: 800 };
    // Held on the sheet, still level with the source.
    expect(extendPosition(atEdge, 'e', boxSize)).toEqual({ x: 840, y: 100 });
  });

  it('grows the way a turned shape is pointing', () => {
    // A quarter turn points its right side down. The source reaches 60 that
    // way (half its width), the new upright shape 28 (half its height).
    const turned: DiagramNode = { ...source, rotation: 90 };
    expect(extendPosition(turned, 'e', boxSize)).toEqual({
      x: 100,
      y: 128 + 60 + EXTEND_GAP + 28 - 28,
    });
  });
});

describe('the shape and arrow an extension makes', () => {
  const styled: DiagramNode = {
    ...source,
    width: 160,
    height: 80,
    fillColor: 'blue',
    strokeColor: 'rose',
    strokeWidthPreset: 'thick',
    fontSizePreset: 'large',
    labelColor: 'rose',
  };
  const ids = { nodeId: 'n2', arrowId: 'arrow-1' };

  it('brings the same shape back at the same size and in the same style', () => {
    const { node } = planExtension([styled], styled, 'e', 'box', ids);
    expect(node).toMatchObject({
      id: 'n2',
      label: '',
      shape: 'box',
      width: 160,
      height: 80,
      fillColor: 'blue',
      strokeColor: 'rose',
      strokeWidthPreset: 'thick',
      fontSizePreset: 'large',
    });
  });

  it('gives a different shape its own size but the same colours', () => {
    const { node } = planExtension([styled], styled, 'e', 'ellipse', ids);
    expect(node).toMatchObject({ shape: 'ellipse', fillColor: 'blue', strokeColor: 'rose' });
    // Its default size, so it stores none.
    expect(node).not.toHaveProperty('width');
  });

  it('gives a text box the source writing but never a fill', () => {
    const { node } = planExtension([styled], styled, 's', 'text', ids);
    expect(node).toMatchObject({ shape: 'text', fontSizePreset: 'large', labelColor: 'rose' });
    expect(node).not.toHaveProperty('fillColor');
    expect(node).not.toHaveProperty('strokeColor');
  });

  it('starts a plain source at the new-shape text size', () => {
    const { node } = planExtension([source], source, 'e', 'box', ids);
    expect(node.fontSizePreset).toBe('medium');
  });

  it('joins the two with an elbowed arrow bound at both ends, aimed at their centres', () => {
    const { arrow, node } = planExtension([source], source, 'e', 'box', ids);
    expect(arrow).toEqual({
      id: 'arrow-1',
      from: { x: 160, y: 128, elementId: 'n1' },
      to: { x: node.x + 60, y: node.y + 28, elementId: 'n2' },
      route: 'elbow',
    });
  });

  it('steers clear of the other shapes on the canvas', () => {
    const neighbour: DiagramNode = { id: 'n3', label: 'N', x: 284, y: 100, shape: 'box' };
    const { node } = planExtension([source, neighbour], source, 'e', 'box', ids);
    expect(node.x).toBe(468);
  });
});

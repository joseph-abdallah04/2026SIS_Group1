import { describe, expect, it } from 'vitest';
import type { DiagramNode, PathElement, TableElement } from '@roundtable/shared';

import { createTable } from './studioTables';
import {
  commonProperties,
  groupProperties,
  propertiesFor,
  studioPropertyDescriptor,
  type StudioTarget,
} from './studioProperties';

const node = (label = 'Idea'): StudioTarget => ({
  kind: 'node',
  element: { id: 'n1', label, x: 0, y: 0, shape: 'box' } as DiagramNode,
});

const edge = (label?: string): StudioTarget => ({
  kind: 'edge',
  element: { from: 'n1', to: 'n2', ...(label ? { label } : {}) },
});

const ink: StudioTarget = {
  kind: 'ink',
  element: {
    id: 'ink-1',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
  },
};

const path = (closed = false): StudioTarget => ({
  kind: 'path',
  element: {
    id: 'path-1',
    anchors: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
    ...(closed ? { closed: true } : {}),
  } as PathElement,
});

const table = (inCellMode = false, cellsHaveText = false): StudioTarget => ({
  kind: 'table',
  element: createTable(2, 2, { x: 0, y: 0 }) as TableElement,
  inCellMode,
  cellsHaveText,
});

const ids = (target: StudioTarget) => propertiesFor(target);

describe('what one element supports', () => {
  it('gives a shape a fill and a line, and formatting only once it has text', () => {
    expect(ids(node(''))).toEqual(['fillColor', 'strokeColor', 'strokeWidth']);
    expect(ids(node('Idea'))).toContain('textFormat');
  });

  it('gives an arrow a line style, and formatting only once it is labelled', () => {
    expect(ids(edge())).toEqual(['strokeColor', 'strokeWidth', 'strokeStyle']);
    expect(ids(edge('becomes'))).toContain('textFormat');
  });

  it('gives ink a colour and a width and nothing else', () => {
    // A stroke is a mark: no fill to give it, no style, no text.
    expect(ids(ink)).toEqual(['strokeColor', 'strokeWidth']);
  });

  it('offers a fill only on a closed path', () => {
    expect(ids(path(false))).not.toContain('fillColor');
    // Matching the write path, which refuses a fill on an open path — the bar
    // never offers something that would be rejected.
    expect(ids(path(true))).toContain('fillColor');
  });

  it('treats a table as its grid until the selection is inside it', () => {
    expect(ids(table(false))).toEqual(['strokeColor', 'strokeWidth', 'textFormat']);
    expect(ids(table(true))).toContain('cellFill');
    expect(ids(table(true))).not.toContain('fillColor');
  });

  it('offers a table its text settings before any cell has been filled in', () => {
    // They apply to every cell, so they are as useful before typing as after.
    expect(ids(table(false))).toContain('textFormat');
    expect(ids(table(true, false))).toContain('textFormat');
  });
});

describe('what a selection has in common', () => {
  it('keeps everything for a single element', () => {
    expect(commonProperties([node()]).map((entry) => entry.id)).toEqual([
      'fillColor',
      'strokeColor',
      'strokeWidth',
      'textFormat',
    ]);
  });

  it('intersects a shape and a stroke down to line colour and width', () => {
    // A stroke has no fill, so the fill control goes.
    expect(commonProperties([node(), ink]).map((entry) => entry.id)).toEqual([
      'strokeColor',
      'strokeWidth',
    ]);
  });

  it('keeps a fill across a shape and a closed path, since it is one property', () => {
    expect(commonProperties([node(), path(true)]).map((entry) => entry.id)).toContain('fillColor');
  });

  it('drops the fill when the path in the selection is open', () => {
    expect(commonProperties([node(), path(false)]).map((entry) => entry.id)).not.toContain(
      'fillColor',
    );
  });

  it("does not confuse a table's cell fill with an element fill", () => {
    // `cellFill` paints cells, `fillColor` paints the element, so a shape and a
    // table in cell mode share neither.
    const shared = commonProperties([node(), table(true, true)]).map((entry) => entry.id);
    expect(shared).not.toContain('fillColor');
    expect(shared).not.toContain('cellFill');
  });

  it('narrows to what a mixed selection genuinely shares', () => {
    // A shape and a table both draw a line and both carry text, so those
    // survive; the fill does not, because a table's is a cell fill.
    expect(commonProperties([node('Idea'), table(true, true)]).map((entry) => entry.id)).toEqual([
      'strokeColor',
      'strokeWidth',
      'textFormat',
    ]);
    // Ink carries a line and nothing else, so a fill leaves nothing shared.
    expect(commonProperties([ink, node('Idea')]).map((entry) => entry.id)).toEqual([
      'strokeColor',
      'strokeWidth',
    ]);
  });

  it('is empty for an empty selection', () => {
    expect(commonProperties([])).toEqual([]);
  });

  it('holds one canonical order however the selection is built', () => {
    const forwards = commonProperties([node(), path(true)]).map((entry) => entry.id);
    const backwards = commonProperties([path(true), node()]).map((entry) => entry.id);
    expect(forwards).toEqual(backwards);
    // Fill always precedes line colour, whichever element was picked first.
    expect(forwards.indexOf('fillColor')).toBeLessThan(forwards.indexOf('strokeColor'));
  });

  it('survives a selection of many of the same kind', () => {
    expect(commonProperties([ink, ink, ink]).map((entry) => entry.id)).toEqual([
      'strokeColor',
      'strokeWidth',
    ]);
  });
});

describe('presentation', () => {
  it('names every property, since the bar is icon-only', () => {
    for (const id of propertiesFor(node())) {
      expect(studioPropertyDescriptor(id).label.length).toBeGreaterThan(0);
    }
  });

  it('runs related controls together into groups', () => {
    const groups = groupProperties(commonProperties([node()]));
    expect(groups.map((entry) => entry.group)).toEqual(['fill', 'stroke', 'text']);
    expect(groups[1]!.properties.map((entry) => entry.id)).toEqual(['strokeColor', 'strokeWidth']);
  });

  it('groups nothing when there is nothing to group', () => {
    expect(groupProperties([])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { DiagramNode, PathElement } from '@roundtable/shared';
import { diagramWriteArtifactSchema } from '@roundtable/shared/schemas';

import { copyStudioFragment, isFragmentEmpty, pasteStudioFragment } from './studioClipboard';
import { EMPTY_STUDIO_SELECTION } from './studioSelection';
import { createTable, setCell } from './studioTables';
import { inkToData } from './studioInk';

const node: DiagramNode = { id: 'n1', label: 'Box', x: 0, y: 0, shape: 'box' };
const path: PathElement = {
  id: 'path-1',
  anchors: [
    { x: 100, y: 100 },
    { x: 160, y: 140 },
  ],
  strokeColor: 'rose',
};
const stroke = {
  id: 'ink-1',
  points: [
    { x: 200, y: 200 },
    { x: 240, y: 260 },
  ],
  strokeColor: 'ink' as const,
};
const table = setCell({ ...createTable(2, 2, { x: 400, y: 400 }), id: 'table-1' }, 0, 0, {
  text: 'Idea',
});

const scene = { nodes: [node], edges: [], ink: [stroke], paths: [path], tables: [table] };
const everything = {
  nodeIds: ['n1'],
  inkIds: ['ink-1'],
  pathIds: ['path-1'],
  tableIds: ['table-1'],
  arrowIds: [],
};

describe('arrows in a fragment', () => {
  const arrow = {
    id: 'arrow-1',
    from: { x: 10, y: 10 },
    to: { x: 60, y: 60, elementId: 'n1' },
  };
  const withArrow = { ...scene, arrows: [arrow] };
  const both = { ...everything, arrowIds: ['arrow-1'] };

  it('repoints a copied arrow at the copied shape', () => {
    // Copying a shape and the arrow pointing at it has to give an arrow
    // pointing at the *new* shape. Left bound to the original, one of the two
    // would move and the other would not.
    const pasted = pasteStudioFragment(withArrow, copyStudioFragment(withArrow, both), {
      x: 40,
      y: 40,
    });
    if (!pasted.ok) throw new Error(pasted.error);
    const copy = pasted.arrows.at(-1)!;
    expect(copy.id).not.toBe('arrow-1');
    expect(copy.to.elementId).not.toBe('n1');
    expect(pasted.nodes.map((node) => node.id)).toContain(copy.to.elementId);
  });

  it('drops a binding to something left behind', () => {
    // The shape stayed where it was, so binding the copy to it would tie the
    // two together. The point survives, so the arrow still has its shape.
    const arrowOnly = {
      ...everything,
      nodeIds: [],
      inkIds: [],
      pathIds: [],
      tableIds: [],
      arrowIds: ['arrow-1'],
    };
    const pasted = pasteStudioFragment(withArrow, copyStudioFragment(withArrow, arrowOnly), {
      x: 40,
      y: 40,
    });
    if (!pasted.ok) throw new Error(pasted.error);
    const copy = pasted.arrows.at(-1)!;
    expect(copy.to.elementId).toBeUndefined();
    expect(copy.to).toEqual({ x: 100, y: 100 });
  });

  it('counts an arrow on its own as something worth pasting', () => {
    const fragment = copyStudioFragment(withArrow, {
      ...EMPTY_STUDIO_SELECTION,
      arrowIds: ['arrow-1'],
    });
    expect(isFragmentEmpty(fragment)).toBe(false);
  });
});

describe('copying', () => {
  it('takes every selected kind', () => {
    const fragment = copyStudioFragment(scene, everything);
    expect(fragment.nodes).toHaveLength(1);
    expect(fragment.ink).toHaveLength(1);
    expect(fragment.paths).toHaveLength(1);
    expect(fragment.tables).toHaveLength(1);
  });

  it('takes only what was selected', () => {
    const fragment = copyStudioFragment(scene, {
      ...EMPTY_STUDIO_SELECTION,
      pathIds: ['path-1'],
    });
    expect(fragment.paths).toHaveLength(1);
    expect(fragment.nodes).toHaveLength(0);
    expect(fragment.ink).toHaveLength(0);
  });

  it('deep-copies, so editing the original cannot reach into the clipboard', () => {
    const fragment = copyStudioFragment(scene, everything);
    fragment.tables[0]!.cells[0]!.text = 'changed';
    fragment.paths[0]!.anchors[0]!.x = 999;
    expect(table.cells[0]!.text).toBe('Idea');
    expect(path.anchors[0]!.x).toBe(100);
  });

  it('reports an empty selection as nothing to paste', () => {
    expect(isFragmentEmpty(copyStudioFragment(scene, EMPTY_STUDIO_SELECTION))).toBe(true);
    expect(isFragmentEmpty(null)).toBe(true);
  });
});

describe('pasting', () => {
  it('refuses when nothing was copied', () => {
    const result = pasteStudioFragment(scene, null, { x: 16, y: 16 });
    expect(result).toEqual({ ok: false, error: 'Copy something first.' });
  });

  it('adds a copy of every kind, offset from the original', () => {
    const fragment = copyStudioFragment(scene, everything);
    const result = pasteStudioFragment(scene, fragment, { x: 16, y: 16 }, false);
    if (!result.ok) throw new Error(result.error);

    expect(result.nodes).toHaveLength(2);
    expect(result.ink).toHaveLength(2);
    expect(result.paths).toHaveLength(2);
    expect(result.tables).toHaveLength(2);
    expect(result.paths[1]!.anchors[0]).toEqual({ x: 116, y: 116 });
    expect(result.tables[1]!.x).toBe(416);
    expect(result.ink[1]!.points[0]).toEqual({ x: 216, y: 216 });
  });

  it('gives every copy a fresh id, so two pastes are two elements', () => {
    const fragment = copyStudioFragment(scene, everything);
    const first = pasteStudioFragment(scene, fragment, { x: 16, y: 16 }, false);
    if (!first.ok) throw new Error(first.error);
    const second = pasteStudioFragment(first, fragment, { x: 32, y: 32 }, false);
    if (!second.ok) throw new Error(second.error);

    const ids = second.paths.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(second.tables).toHaveLength(3);
  });

  it('carries the styling and the content of what was copied', () => {
    const fragment = copyStudioFragment(scene, everything);
    const result = pasteStudioFragment(scene, fragment, { x: 16, y: 16 }, false);
    if (!result.ok) throw new Error(result.error);
    expect(result.paths[1]!.strokeColor).toBe('rose');
    expect(result.tables[1]!.cells[0]!.text).toBe('Idea');
  });

  it('names what landed so the caller can select it', () => {
    const fragment = copyStudioFragment(scene, everything);
    const result = pasteStudioFragment(scene, fragment, { x: 16, y: 16 }, false);
    if (!result.ok) throw new Error(result.error);
    expect(result.selection.nodeIds).toHaveLength(1);
    expect(result.selection.pathIds).toEqual([result.paths[1]!.id]);
    expect(result.selection.tableIds).toEqual([result.tables[1]!.id]);
  });

  it('pastes studio elements even when no node came along', () => {
    // The diagram's own paster refuses an empty node list, so this path has to
    // avoid asking it at all.
    const fragment = copyStudioFragment(scene, { ...EMPTY_STUDIO_SELECTION, pathIds: ['path-1'] });
    const result = pasteStudioFragment(scene, fragment, { x: 8, y: 8 }, false);
    if (!result.ok) throw new Error(result.error);
    expect(result.paths).toHaveLength(2);
    expect(result.nodes).toHaveLength(1);
  });

  it('produces a scene the real write contract accepts', () => {
    const fragment = copyStudioFragment(scene, everything);
    const result = pasteStudioFragment(scene, fragment, { x: 16, y: 16 }, false);
    if (!result.ok) throw new Error(result.error);
    expect(
      diagramWriteArtifactSchema.safeParse({
        type: 'diagram',
        nodes: result.nodes,
        edges: result.edges,
        ink: inkToData(result.ink),
        paths: result.paths,
        tables: result.tables,
      }).success,
    ).toBe(true);
  });
});

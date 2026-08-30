import { describe, expect, it } from 'vitest';

import { layoutDiagram, NODE_SPACING_X } from './layout.js';

describe('layoutDiagram', () => {
  it('puts a chain in left-to-right columns', () => {
    const nodes = layoutDiagram(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    );
    const x = Object.fromEntries(nodes.map((n) => [n.id, n.x]));
    expect(x.b! - x.a!).toBe(NODE_SPACING_X);
    expect(x.c! - x.b!).toBe(NODE_SPACING_X);
  });

  it('stacks siblings in the same column at different heights', () => {
    const nodes = layoutDiagram(
      [
        { id: 'root', label: 'Root' },
        { id: 'l', label: 'Left' },
        { id: 'r', label: 'Right' },
      ],
      [
        { from: 'root', to: 'l' },
        { from: 'root', to: 'r' },
      ],
    );
    const left = nodes.find((n) => n.id === 'l');
    const right = nodes.find((n) => n.id === 'r');
    expect(left?.x).toBe(right?.x);
    expect(left?.y).not.toBe(right?.y);
  });

  it('never overlaps two nodes', () => {
    const nodes = layoutDiagram(
      Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` })),
      [
        { from: 'n0', to: 'n1' },
        { from: 'n0', to: 'n2' },
        { from: 'n1', to: 'n3' },
        { from: 'n2', to: 'n3' },
        { from: 'n3', to: 'n4' },
      ],
    );
    const seen = new Set(nodes.map((n) => `${n.x}:${n.y}`));
    expect(seen.size).toBe(nodes.length);
  });

  it('terminates on a cycle', () => {
    const nodes = layoutDiagram(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ],
    );
    expect(nodes).toHaveLength(3);
    expect(nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });

  it('places disconnected nodes rather than dropping them', () => {
    const nodes = layoutDiagram(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'orphan', label: 'Orphan' },
      ],
      [{ from: 'a', to: 'b' }],
    );
    expect(nodes.map((n) => n.id)).toEqual(['a', 'b', 'orphan']);
  });

  it('ignores edges pointing at nodes that do not exist', () => {
    const nodes = layoutDiagram([{ id: 'a', label: 'A' }], [{ from: 'a', to: 'ghost' }]);
    expect(nodes).toHaveLength(1);
  });

  it('preserves the input order of nodes', () => {
    const nodes = layoutDiagram(
      [
        { id: 'z', label: 'Z' },
        { id: 'y', label: 'Y' },
      ],
      [{ from: 'y', to: 'z' }],
    );
    expect(nodes.map((n) => n.id)).toEqual(['z', 'y']);
  });
});

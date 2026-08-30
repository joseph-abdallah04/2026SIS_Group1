// Deterministic left-to-right layered layout for generated diagrams.
//
// The model is asked for *structure* (nodes and edges) and never for coordinates: LLMs are
// poor at spatial arithmetic, and a layout computed here is stable, non-overlapping, and
// identical for the same input every time.
import type { DiagramEdge, DiagramNode } from '@roundtable/shared';

export const NODE_SPACING_X = 230;
export const NODE_SPACING_Y = 120;
export const ORIGIN_X = 60;
export const ORIGIN_Y = 60;

export interface UnpositionedNode {
  id: string;
  label: string;
}

/**
 * Assigns each node to a column by its longest path from a root, then spreads columns
 * vertically and centres them against the tallest column.
 *
 * Cycles are tolerated: a node already assigned keeps its first (shallowest) column, so a
 * loop back to an earlier node does not push it rightwards forever.
 */
export function layoutDiagram(nodes: UnpositionedNode[], edges: DiagramEdge[]): DiagramNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const usableEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));

  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of nodes) {
    outgoing.set(node.id, []);
    indegree.set(node.id, 0);
  }
  for (const edge of usableEdges) {
    outgoing.get(edge.from)?.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const level = new Map<string, number>();
  // Roots first; if every node has an incoming edge (a pure cycle) start from the first node.
  const roots = nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const queue: string[] = roots.length > 0 ? [...roots] : nodes[0] ? [nodes[0].id] : [];
  for (const id of queue) level.set(id, 0);

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const currentLevel = level.get(current) ?? 0;
    for (const next of outgoing.get(current) ?? []) {
      const candidate = currentLevel + 1;
      if (!level.has(next)) {
        level.set(next, candidate);
        queue.push(next);
      } else if ((level.get(next) as number) < candidate && candidate < nodes.length) {
        // Push it right so an edge never points backwards, but never past the node count
        // (that bound is what stops a cycle from looping forever).
        level.set(next, candidate);
        queue.push(next);
      }
    }
  }

  // Disconnected nodes land in column 0.
  for (const node of nodes) {
    if (!level.has(node.id)) level.set(node.id, 0);
  }

  const columns = new Map<number, UnpositionedNode[]>();
  for (const node of nodes) {
    const col = level.get(node.id) ?? 0;
    const bucket = columns.get(col);
    if (bucket) bucket.push(node);
    else columns.set(col, [node]);
  }

  const tallest = Math.max(...[...columns.values()].map((c) => c.length), 1);

  const positioned: DiagramNode[] = [];
  for (const [col, bucket] of [...columns.entries()].sort(([a], [b]) => a - b)) {
    const offset = ((tallest - bucket.length) * NODE_SPACING_Y) / 2;
    bucket.forEach((node, row) => {
      positioned.push({
        id: node.id,
        label: node.label,
        x: ORIGIN_X + col * NODE_SPACING_X,
        y: ORIGIN_Y + offset + row * NODE_SPACING_Y,
      });
    });
  }

  // Preserve the caller's node order so the output reads the way the model wrote it.
  const byId = new Map(positioned.map((n) => [n.id, n]));
  return nodes.map((n) => byId.get(n.id) as DiagramNode);
}

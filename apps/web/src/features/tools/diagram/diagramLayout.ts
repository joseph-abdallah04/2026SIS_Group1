import type { DiagramEdge, DiagramNode } from '@roundtable/shared';
import { diagramCanParent, effectiveDiagramNodeSize } from '@roundtable/shared';

import {
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CANVAS_WIDTH,
  snapToGrid,
  type DiagramPoint,
  type DiagramRect,
} from './diagramModel';

export type DiagramLayoutDirection = 'TB' | 'LR';

/** Space between successive ranks, along the flow direction. */
const RANK_GAP = 56;
/** Space between siblings inside one rank. */
const SIBLING_GAP = 32;
/** Space between disconnected components. */
const COMPONENT_GAP = 48;
/** Inset between a container's border and the children laid out inside it. */
const CONTAINER_PADDING = 20;
/** Barycenter sweeps. Four is enough to settle the graphs this editor holds. */
const ORDERING_SWEEPS = 4;

interface PlacedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutBlock {
  nodes: PlacedNode[];
  width: number;
  height: number;
}

function sizeOf(node: DiagramNode) {
  return effectiveDiagramNodeSize(node);
}

/**
 * Depth-first search marking edges that point back at the node stack. Removing
 * them turns any graph, cycles included, into a DAG that can be ranked. The
 * arrows themselves are untouched — this only decides layout order.
 */
function acyclicEdges(ids: readonly string[], edges: readonly DiagramEdge[]): DiagramEdge[] {
  const outgoing = new Map<string, DiagramEdge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
    else outgoing.set(edge.from, [edge]);
  }

  const backEdges = new Set<DiagramEdge>();
  const visited = new Set<string>();
  const onStack = new Set<string>();

  const walk = (id: string) => {
    visited.add(id);
    onStack.add(id);
    for (const edge of outgoing.get(id) ?? []) {
      if (onStack.has(edge.to)) backEdges.add(edge);
      else if (!visited.has(edge.to)) walk(edge.to);
    }
    onStack.delete(id);
  };

  // Seeded in the diagram's own node order, so the result is deterministic.
  for (const id of ids) if (!visited.has(id)) walk(id);
  return edges.filter((edge) => !backEdges.has(edge));
}

/** Longest-path layering: a node sits one rank below its deepest predecessor. */
function rankNodes(ids: readonly string[], edges: readonly DiagramEdge[]): Map<string, number> {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const id of ids) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  for (const edge of edges) {
    incoming.get(edge.to)?.push(edge.from);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const rank = new Map<string, number>();
  const remaining = new Map(ids.map((id) => [id, incoming.get(id)!.length]));
  const queue = ids.filter((id) => remaining.get(id) === 0);
  for (const id of queue) rank.set(id, 0);

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const next of outgoing.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
      const left = (remaining.get(next) ?? 0) - 1;
      remaining.set(next, left);
      if (left === 0) queue.push(next);
    }
  }

  // Anything still unranked sat on a cycle the DFS could not fully unwind.
  for (const id of ids) if (!rank.has(id)) rank.set(id, 0);
  return rank;
}

/**
 * Barycenter ordering: repeatedly move each node next to the average position
 * of its neighbours in the adjacent rank. This is the standard crossing
 * reduction heuristic and converges quickly on diagrams of this size.
 */
function orderRanks(layers: string[][], edges: readonly DiagramEdge[]): string[][] {
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  const append = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  for (const edge of edges) {
    append(predecessors, edge.to, edge.from);
    append(successors, edge.from, edge.to);
  }

  const ordered = layers.map((layer) => [...layer]);

  const sweep = (from: number, to: number, step: number, neighbours: Map<string, string[]>) => {
    for (let index = from; index !== to; index += step) {
      const reference = new Map(ordered[index - step]!.map((id, position) => [id, position]));
      const current = ordered[index]!;
      const keyed = current.map((id, position) => {
        const related = (neighbours.get(id) ?? [])
          .map((other) => reference.get(other))
          .filter((value): value is number => value !== undefined);
        // A node with no neighbour in the reference rank keeps its place.
        const barycenter =
          related.length > 0 ? related.reduce((a, b) => a + b, 0) / related.length : position;
        return { id, barycenter, position };
      });
      keyed.sort((a, b) => a.barycenter - b.barycenter || a.position - b.position);
      ordered[index] = keyed.map((entry) => entry.id);
    }
  };

  for (let pass = 0; pass < ORDERING_SWEEPS; pass += 1) {
    if (pass % 2 === 0) sweep(1, ordered.length, 1, predecessors);
    else sweep(ordered.length - 2, -1, -1, successors);
  }
  return ordered;
}

/** Undirected connected components, in the diagram's own node order. */
function components(ids: readonly string[], edges: readonly DiagramEdge[]): string[][] {
  const neighbours = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of edges) {
    neighbours.get(edge.from)?.push(edge.to);
    neighbours.get(edge.to)?.push(edge.from);
  }

  const seen = new Set<string>();
  const found: string[][] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const group: string[] = [];
    const queue = [id];
    seen.add(id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      group.push(current);
      for (const next of neighbours.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    found.push(group);
  }
  return found;
}

/** Lays one connected component out in ranks, relative to (0, 0). */
function layoutComponent(
  ids: readonly string[],
  edges: readonly DiagramEdge[],
  byId: Map<string, DiagramNode>,
  direction: DiagramLayoutDirection,
): LayoutBlock {
  const dag = acyclicEdges(ids, edges);
  const rank = rankNodes(ids, dag);
  const depth = Math.max(...ids.map((id) => rank.get(id) ?? 0)) + 1;

  const layers: string[][] = Array.from({ length: depth }, () => []);
  for (const id of ids) layers[rank.get(id) ?? 0]!.push(id);
  const ordered = orderRanks(layers, dag);

  const vertical = direction === 'TB';
  const mainOf = (id: string) =>
    vertical ? sizeOf(byId.get(id)!).height : sizeOf(byId.get(id)!).width;
  const crossOf = (id: string) =>
    vertical ? sizeOf(byId.get(id)!).width : sizeOf(byId.get(id)!).height;

  const layerMain = ordered.map((layer) => Math.max(0, ...layer.map(mainOf)));
  const layerCross = ordered.map(
    (layer) =>
      layer.reduce((total, id) => total + crossOf(id), 0) +
      SIBLING_GAP * Math.max(0, layer.length - 1),
  );
  const totalCross = Math.max(0, ...layerCross);
  const totalMain =
    layerMain.reduce((total, value) => total + value, 0) + RANK_GAP * Math.max(0, depth - 1);

  const placed: PlacedNode[] = [];
  let mainOffset = 0;
  ordered.forEach((layer, index) => {
    // Each rank is centred on the widest rank, which keeps trees symmetric.
    let crossOffset = (totalCross - layerCross[index]!) / 2;
    for (const id of layer) {
      const size = sizeOf(byId.get(id)!);
      // Centre each node within its rank's thickness.
      const centred = mainOffset + (layerMain[index]! - mainOf(id)) / 2;
      placed.push({
        id,
        x: vertical ? crossOffset : centred,
        y: vertical ? centred : crossOffset,
        width: size.width,
        height: size.height,
      });
      crossOffset += crossOf(id) + SIBLING_GAP;
    }
    mainOffset += layerMain[index]! + RANK_GAP;
  });

  return {
    nodes: placed,
    width: vertical ? totalCross : totalMain,
    height: vertical ? totalMain : totalCross,
  };
}

/** Packs isolated nodes into a compact grid, the deterministic fallback. */
function layoutIsolated(
  ids: readonly string[],
  byId: Map<string, DiagramNode>,
  available: number,
  direction: DiagramLayoutDirection,
): LayoutBlock {
  if (ids.length === 0) return { nodes: [], width: 0, height: 0 };

  const widest = Math.max(...ids.map((id) => sizeOf(byId.get(id)!).width));
  const tallest = Math.max(...ids.map((id) => sizeOf(byId.get(id)!).height));
  const across = direction === 'TB' ? widest : tallest;
  const columns = Math.max(1, Math.min(ids.length, Math.floor(available / (across + SIBLING_GAP))));

  const placed: PlacedNode[] = [];
  ids.forEach((id, index) => {
    const size = sizeOf(byId.get(id)!);
    const column = index % columns;
    const row = Math.floor(index / columns);
    placed.push({
      id,
      x: column * (widest + SIBLING_GAP),
      y: row * (tallest + SIBLING_GAP),
      width: size.width,
      height: size.height,
    });
  });

  const rows = Math.ceil(ids.length / columns);
  return {
    nodes: placed,
    width: columns * widest + SIBLING_GAP * (columns - 1),
    height: rows * tallest + SIBLING_GAP * (rows - 1),
  };
}

/** Lays out one grouping scope: everything sharing a parent. */
function layoutScope(
  ids: readonly string[],
  edges: readonly DiagramEdge[],
  byId: Map<string, DiagramNode>,
  direction: DiagramLayoutDirection,
  available: DiagramPoint,
): LayoutBlock {
  const scope = new Set(ids);
  const inner = edges.filter((edge) => scope.has(edge.from) && scope.has(edge.to));
  const vertical = direction === 'TB';

  const connected: string[][] = [];
  const isolated: string[] = [];
  for (const group of components(ids, inner)) {
    if (
      group.length === 1 &&
      !inner.some((edge) => edge.from === group[0] || edge.to === group[0])
    ) {
      isolated.push(group[0]!);
    } else {
      connected.push(group);
    }
  }

  // Ranks need room along the flow axis. A chain taller than the sheet cannot be
  // laid out in ranks without stacking nodes on top of each other, so that
  // component falls back to the deterministic grid instead.
  const mainLimit = vertical ? available.y : available.x;
  const crossLimit = vertical ? available.x : available.y;
  const blocks = connected.map((group) => {
    const ranked = layoutComponent(group, inner, byId, direction);
    const mainExtent = vertical ? ranked.height : ranked.width;
    return mainExtent > mainLimit ? layoutIsolated(group, byId, crossLimit, direction) : ranked;
  });
  const isolatedBlock = layoutIsolated(isolated, byId, crossLimit, direction);
  if (isolatedBlock.nodes.length > 0) blocks.push(isolatedBlock);

  // Components stack across the flow so each one reads as its own column/row.
  const placed: PlacedNode[] = [];
  let crossOffset = 0;
  let mainExtent = 0;
  for (const block of blocks) {
    for (const node of block.nodes) {
      placed.push({
        ...node,
        x: vertical ? node.x + crossOffset : node.x,
        y: vertical ? node.y : node.y + crossOffset,
      });
    }
    crossOffset += (vertical ? block.width : block.height) + COMPONENT_GAP;
    mainExtent = Math.max(mainExtent, vertical ? block.height : block.width);
  }
  const totalCross = Math.max(0, crossOffset - COMPONENT_GAP);

  return {
    nodes: placed,
    width: vertical ? totalCross : mainExtent,
    height: vertical ? mainExtent : totalCross,
  };
}

function clampIntoRect(value: number, extent: number, rect: DiagramRect, axis: 'x' | 'y'): number {
  const min = axis === 'x' ? rect.x : rect.y;
  const max = min + (axis === 'x' ? rect.width : rect.height) - extent;
  return Math.round(Math.min(Math.max(value, min), Math.max(min, max)));
}

/**
 * Graph-aware Arrange.
 *
 * Ranks nodes along their arrows so the flow reads in one direction, orders each
 * rank to cut crossings, and honours each node's real size. Grouping is respected
 * recursively: a container's children are laid out inside it (growing it within
 * the bounded size contract if they need the room), deepest containers first, so
 * an outer layout already knows how big its members are. Scopes with no arrows
 * fall back to the deterministic grid.
 *
 * Positions only — ids, arrows, styles and grouping are never touched.
 */
export function layoutDiagram(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
  direction: DiagramLayoutDirection = 'TB',
): DiagramNode[] {
  if (nodes.length === 0) return [];

  const result = new Map(nodes.map((node) => [node.id, { ...node }]));
  const byId = () => new Map([...result].map(([id, node]) => [id, node] as const));

  const childrenOf = new Map<string, string[]>();
  const roots: string[] = [];
  for (const node of nodes) {
    if (node.parentId && result.has(node.parentId)) {
      const siblings = childrenOf.get(node.parentId);
      if (siblings) siblings.push(node.id);
      else childrenOf.set(node.parentId, [node.id]);
    } else {
      roots.push(node.id);
    }
  }

  // Deepest containers first so a parent lays out around final child sizes.
  const depthOf = (id: string): number => {
    let depth = 0;
    let current = result.get(id)?.parentId;
    const seen = new Set<string>();
    while (current && result.has(current) && !seen.has(current)) {
      seen.add(current);
      depth += 1;
      current = result.get(current)?.parentId;
    }
    return depth;
  };
  const containers = nodes
    .filter((node) => diagramCanParent(node.shape) && (childrenOf.get(node.id)?.length ?? 0) > 0)
    .sort((a, b) => depthOf(b.id) - depthOf(a.id));

  for (const container of containers) {
    const children = childrenOf.get(container.id)!;
    const block = layoutScope(children, edges, byId(), direction, {
      x: DIAGRAM_CANVAS_WIDTH,
      y: DIAGRAM_CANVAS_HEIGHT,
    });

    // Grow the container to hold its contents, within the bounded size contract.
    const current = result.get(container.id)!;
    const needed = {
      width: block.width + CONTAINER_PADDING * 2,
      height: block.height + CONTAINER_PADDING * 2,
    };
    const existing = effectiveDiagramNodeSize(current);
    const width = snapToGrid(Math.max(existing.width, needed.width));
    const height = snapToGrid(Math.max(existing.height, needed.height));
    if (width !== existing.width || height !== existing.height) {
      current.width = Math.min(width, 480);
      current.height = Math.min(height, 320);
    }

    const bounds: DiagramRect = {
      x: current.x + CONTAINER_PADDING,
      y: current.y + CONTAINER_PADDING,
      width: effectiveDiagramNodeSize(current).width - CONTAINER_PADDING * 2,
      height: effectiveDiagramNodeSize(current).height - CONTAINER_PADDING * 2,
    };
    for (const placed of block.nodes) {
      const node = result.get(placed.id)!;
      node.x = clampIntoRect(bounds.x + placed.x, placed.width, bounds, 'x');
      node.y = clampIntoRect(bounds.y + placed.y, placed.height, bounds, 'y');
    }
  }

  const topLevel = layoutScope(roots, edges, byId(), direction, {
    x: DIAGRAM_CANVAS_WIDTH,
    y: DIAGRAM_CANVAS_HEIGHT,
  });

  // Centre the whole arrangement on the sheet, then pin it inside the bounds.
  const sheet: DiagramRect = {
    x: 0,
    y: 0,
    width: DIAGRAM_CANVAS_WIDTH,
    height: DIAGRAM_CANVAS_HEIGHT,
  };
  const originX = Math.max(0, (DIAGRAM_CANVAS_WIDTH - topLevel.width) / 2);
  const originY = Math.max(0, (DIAGRAM_CANVAS_HEIGHT - topLevel.height) / 2);

  for (const placed of topLevel.nodes) {
    const node = result.get(placed.id)!;
    const nextX = clampIntoRect(originX + placed.x, placed.width, sheet, 'x');
    const nextY = clampIntoRect(originY + placed.y, placed.height, sheet, 'y');
    // Containers carry their contents, so shift descendants by the same delta.
    const deltaX = nextX - node.x;
    const deltaY = nextY - node.y;
    node.x = nextX;
    node.y = nextY;
    if (deltaX === 0 && deltaY === 0) continue;
    for (const id of descendantsOf(placed.id, childrenOf)) {
      const child = result.get(id)!;
      child.x = clampIntoRect(child.x + deltaX, effectiveDiagramNodeSize(child).width, sheet, 'x');
      child.y = clampIntoRect(child.y + deltaY, effectiveDiagramNodeSize(child).height, sheet, 'y');
    }
  }

  return nodes.map((node) => result.get(node.id)!);
}

function descendantsOf(id: string, childrenOf: Map<string, string[]>): string[] {
  const found: string[] = [];
  const queue = [...(childrenOf.get(id) ?? [])];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const current = queue.shift()!;
    found.push(current);
    for (const child of childrenOf.get(current) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return found;
}

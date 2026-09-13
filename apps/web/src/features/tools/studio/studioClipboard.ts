// Copy, paste and duplicate across every element kind.
//
// Nodes and edges keep their own copier: it already handles id minting, edge
// endpoints and container re-parenting, and none of that changes because ink
// arrived. This wraps it so a fragment can also carry ink, paths and tables,
// each of which needs nothing more than a fresh id and an offset.

import type {
  ArrowElement,
  DiagramEdge,
  DiagramNode,
  PathElement,
  TableElement,
} from '@roundtable/shared';

import {
  copyDiagramFragment,
  pasteDiagramFragment,
  type DiagramPoint,
  type PasteFragment,
} from '../diagram/diagramModel';
import { createArrowId } from './studioArrowDraft';
import { createInkId, type StudioInkStroke } from './studioInk';
import { createPathId } from './studioPaths';
import { createTableId } from './studioTables';
import { EMPTY_STUDIO_SELECTION, type StudioSelection } from './studioSelection';

export interface StudioFragment extends PasteFragment {
  ink: StudioInkStroke[];
  paths: PathElement[];
  tables: TableElement[];
  arrows: ArrowElement[];
}

export interface StudioScene {
  nodes: readonly DiagramNode[];
  edges: readonly DiagramEdge[];
  ink?: readonly StudioInkStroke[];
  paths?: readonly PathElement[];
  tables?: readonly TableElement[];
  arrows?: readonly ArrowElement[];
}

export function isFragmentEmpty(fragment: StudioFragment | null): boolean {
  return (
    fragment === null ||
    (fragment.nodes.length === 0 &&
      fragment.ink.length === 0 &&
      fragment.paths.length === 0 &&
      fragment.tables.length === 0 &&
      fragment.arrows.length === 0)
  );
}

export function copyStudioFragment(scene: StudioScene, selection: StudioSelection): StudioFragment {
  const diagram = copyDiagramFragment(scene.nodes, scene.edges, selection.nodeIds);
  const inkWanted = new Set(selection.inkIds);
  const pathsWanted = new Set(selection.pathIds);
  const tablesWanted = new Set(selection.tableIds);
  const arrowsWanted = new Set(selection.arrowIds);

  return {
    ...diagram,
    ink: (scene.ink ?? [])
      .filter((stroke) => inkWanted.has(stroke.id))
      .map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) })),
    paths: (scene.paths ?? [])
      .filter((path) => pathsWanted.has(path.id))
      .map((path) => ({ ...path, anchors: path.anchors.map((anchor) => ({ ...anchor })) })),
    tables: (scene.tables ?? [])
      .filter((table) => tablesWanted.has(table.id))
      .map((table) => ({
        ...table,
        colWidths: [...table.colWidths],
        rowHeights: [...table.rowHeights],
        cells: table.cells.map((cell) => ({ ...cell })),
      })),
    arrows: (scene.arrows ?? [])
      .filter((arrow) => arrowsWanted.has(arrow.id))
      .map((arrow) => ({ ...arrow, from: { ...arrow.from }, to: { ...arrow.to } })),
  };
}

export type StudioPasteResult =
  | {
      ok: true;
      nodes: DiagramNode[];
      edges: DiagramEdge[];
      ink: StudioInkStroke[];
      paths: PathElement[];
      tables: TableElement[];
      arrows: ArrowElement[];
      selection: StudioSelection;
    }
  | { ok: false; error: string };

/**
 * Paste a fragment, offset from where it was copied.
 *
 * Every pasted element gets a fresh id, so pasting twice gives two independent
 * copies rather than two references to one. The result names what landed, so
 * the caller can select it — pasting something you cannot immediately move is
 * a step short of useful.
 */
export function pasteStudioFragment(
  scene: StudioScene,
  fragment: StudioFragment | null,
  offset: DiagramPoint,
  snap = true,
): StudioPasteResult {
  if (isFragmentEmpty(fragment)) return { ok: false, error: 'Copy something first.' };
  const source = fragment as StudioFragment;

  // Nodes and edges are delegated; only ask when the fragment has any, since
  // the diagram paster refuses an empty one.
  let nodes = [...scene.nodes];
  let edges = [...scene.edges];
  let nodeIds: string[] = [];
  if (source.nodes.length > 0) {
    const pasted = pasteDiagramFragment(scene.nodes, scene.edges, source, offset, snap);
    if (!pasted.ok) return pasted;
    nodes = pasted.nodes;
    edges = pasted.edges;
    nodeIds = pasted.addedIds;
  }

  // Old id to new, for every element that came along. An arrow's bindings are
  // remapped through it below; the fragment keeps the original ids, which is
  // what makes that possible.
  const copiedIds = new Map<string, string>();
  source.nodes.forEach((node, index) => {
    const copied = nodeIds[index];
    if (copied) copiedIds.set(node.id, copied);
  });

  const ink = [...(scene.ink ?? [])];
  const inkIds: string[] = [];
  for (const stroke of source.ink) {
    const id = createInkId();
    inkIds.push(id);
    copiedIds.set(stroke.id, id);
    ink.push({
      ...stroke,
      id,
      points: stroke.points.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })),
    });
  }

  const paths = [...(scene.paths ?? [])];
  const pathIds: string[] = [];
  for (const path of source.paths) {
    const id = createPathId();
    pathIds.push(id);
    copiedIds.set(path.id, id);
    paths.push({
      ...path,
      id,
      anchors: path.anchors.map((anchor) => ({
        ...anchor,
        x: anchor.x + offset.x,
        y: anchor.y + offset.y,
      })),
    });
  }

  const tables = [...(scene.tables ?? [])];
  const tableIds: string[] = [];
  for (const table of source.tables) {
    const id = createTableId();
    tableIds.push(id);
    copiedIds.set(table.id, id);
    tables.push({
      ...table,
      id,
      x: table.x + offset.x,
      y: table.y + offset.y,
      colWidths: [...table.colWidths],
      rowHeights: [...table.rowHeights],
      cells: table.cells.map((cell) => ({ ...cell })),
    });
  }

  // An arrow's bindings are remapped onto the copies: pasting a shape and the
  // arrow pointing at it gives an arrow pointing at the *new* shape. A binding
  // to something left behind is dropped rather than kept — it would tie the
  // copy to the original, so one of the two would move and the other would not.
  const rebind = (endpoint: ArrowElement['from']): ArrowElement['from'] => {
    const moved = { x: endpoint.x + offset.x, y: endpoint.y + offset.y };
    if (endpoint.elementId === undefined) return moved;
    const copied = copiedIds.get(endpoint.elementId);
    return copied ? { ...moved, elementId: copied } : moved;
  };

  const arrows = [...(scene.arrows ?? [])];
  const arrowIds: string[] = [];
  for (const arrow of source.arrows) {
    const id = createArrowId();
    arrowIds.push(id);
    arrows.push({ ...arrow, id, from: rebind(arrow.from), to: rebind(arrow.to) });
  }

  return {
    ok: true,
    nodes,
    edges,
    ink,
    paths,
    tables,
    arrows,
    selection: { ...EMPTY_STUDIO_SELECTION, nodeIds, inkIds, pathIds, tableIds, arrowIds },
  };
}

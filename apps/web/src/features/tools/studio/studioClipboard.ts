// Copy, paste and duplicate across every element kind.
//
// Nodes and edges keep their own copier: it already handles id minting, edge
// endpoints and container re-parenting, and none of that changes because ink
// arrived. This wraps it so a fragment can also carry ink, paths and tables,
// each of which needs nothing more than a fresh id and an offset.

import type { DiagramEdge, DiagramNode, PathElement, TableElement } from '@roundtable/shared';

import {
  copyDiagramFragment,
  pasteDiagramFragment,
  type DiagramPoint,
  type PasteFragment,
} from '../diagram/diagramModel';
import { createInkId, type StudioInkStroke } from './studioInk';
import { createPathId } from './studioPaths';
import { createTableId } from './studioTables';
import { EMPTY_STUDIO_SELECTION, type StudioSelection } from './studioSelection';

export interface StudioFragment extends PasteFragment {
  ink: StudioInkStroke[];
  paths: PathElement[];
  tables: TableElement[];
}

export interface StudioScene {
  nodes: readonly DiagramNode[];
  edges: readonly DiagramEdge[];
  ink?: readonly StudioInkStroke[];
  paths?: readonly PathElement[];
  tables?: readonly TableElement[];
}

export function isFragmentEmpty(fragment: StudioFragment | null): boolean {
  return (
    fragment === null ||
    (fragment.nodes.length === 0 &&
      fragment.ink.length === 0 &&
      fragment.paths.length === 0 &&
      fragment.tables.length === 0)
  );
}

export function copyStudioFragment(scene: StudioScene, selection: StudioSelection): StudioFragment {
  const diagram = copyDiagramFragment(scene.nodes, scene.edges, selection.nodeIds);
  const inkWanted = new Set(selection.inkIds);
  const pathsWanted = new Set(selection.pathIds);
  const tablesWanted = new Set(selection.tableIds);

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

  const ink = [...(scene.ink ?? [])];
  const inkIds: string[] = [];
  for (const stroke of source.ink) {
    const id = createInkId();
    inkIds.push(id);
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

  return {
    ok: true,
    nodes,
    edges,
    ink,
    paths,
    tables,
    selection: { ...EMPTY_STUDIO_SELECTION, nodeIds, inkIds, pathIds, tableIds },
  };
}

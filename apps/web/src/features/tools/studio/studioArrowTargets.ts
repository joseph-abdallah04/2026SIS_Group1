// What an arrow's endpoints can be bound to, on a given canvas.
//
// The geometry in `@roundtable/shared` takes a lookup rather than a scene, so
// that it stays free of the editor's own element shapes. This is the other half:
// turning whatever a surface happens to be holding into that lookup. Both the
// editor and the board card go through it, so an arrow lands on the same point
// of the same shape in either place.

import {
  effectiveDiagramNodeSize,
  tableSize,
  type ArrowTarget,
  type ArrowTargetLookup,
  type DiagramNode,
  type PathElement,
  type StrokePoint,
  type TableElement,
} from '@roundtable/shared';

/**
 * Everything on a canvas an arrow may point at.
 *
 * Ink arrives unpacked, because that is the form the editor works in; the board
 * card unpacks its stored strokes on the way in. Arrows are deliberately absent:
 * binding one arrow to another would make each one's route depend on the other's.
 */
export interface ArrowTargetScene {
  nodes?: readonly DiagramNode[];
  ink?: readonly { id: string; points: readonly StrokePoint[] }[];
  paths?: readonly PathElement[];
  tables?: readonly TableElement[];
}

/**
 * A stroke drawn as a dot, or a perfectly straight line, has no extent on one
 * axis — and a box with a zero half-extent has no boundary to land on, so the
 * arrow would collapse to its centre. Two units is enough to give it one.
 */
const MIN_TARGET_EXTENT = 2;

function boundsOf(points: readonly { x: number; y: number }[]): ArrowTarget['box'] | null {
  const first = points[0];
  if (!first) return null;
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return pad({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

function pad(box: ArrowTarget['box']): ArrowTarget['box'] {
  const width = Math.max(box.width, MIN_TARGET_EXTENT);
  const height = Math.max(box.height, MIN_TARGET_EXTENT);
  return {
    x: box.x - (width - box.width) / 2,
    y: box.y - (height - box.height) / 2,
    width,
    height,
  };
}

/** Every bindable element on the canvas, by id. */
export function arrowTargets(scene: ArrowTargetScene): Map<string, ArrowTarget> {
  const targets = new Map<string, ArrowTarget>();

  for (const node of scene.nodes ?? []) {
    const size = effectiveDiagramNodeSize(node);
    // A node carries its shape through, so an arrow meets an ellipse on its
    // curve and a diamond on its slope rather than on the box around it.
    targets.set(node.id, {
      id: node.id,
      box: pad({ x: node.x, y: node.y, width: size.width, height: size.height }),
      shape: node.shape,
    });
  }
  for (const table of scene.tables ?? []) {
    const size = tableSize(table);
    targets.set(table.id, {
      id: table.id,
      box: pad({ x: table.x, y: table.y, width: size.width, height: size.height }),
    });
  }
  // Ink and paths are freeform: the box around a stroke is mostly empty, so an
  // arrow lands where it was aimed rather than at that box's edge. Pointing at
  // a drawing should touch the drawing.
  for (const stroke of scene.ink ?? []) {
    const box = boundsOf(stroke.points);
    if (box) targets.set(stroke.id, { id: stroke.id, box, freeform: true });
  }
  for (const path of scene.paths ?? []) {
    // The anchors, not the curve: a bezier can bow a little outside the box its
    // anchors describe, and the same approximation is what a marquee sweep uses.
    const box = boundsOf(path.anchors);
    if (box) targets.set(path.id, { id: path.id, box, freeform: true });
  }

  return targets;
}

export function arrowTargetLookup(scene: ArrowTargetScene): ArrowTargetLookup {
  const targets = arrowTargets(scene);
  return (elementId) => targets.get(elementId);
}

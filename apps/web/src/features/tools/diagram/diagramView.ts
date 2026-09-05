import type { DiagramNode } from '@roundtable/shared';

import {
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CANVAS_WIDTH,
  DIAGRAM_FULL_VIEW_BOX,
  nodeBounds,
  type DiagramPoint,
  type DiagramRect,
} from './diagramModel';

// The sheet is a fixed 960x600 surface and every node position is clamped to it,
// so 100% already shows the whole diagram and zooming out further would only add
// empty margin. Zoom therefore only ever magnifies.
export const DIAGRAM_MIN_ZOOM = 1;
export const DIAGRAM_MAX_ZOOM = 4;
export const DIAGRAM_ZOOM_STEP = 1.25;

// Breathing room around the content when fitting, in sheet units.
const FIT_PADDING = 24;

/** The visible slice of the sheet. Its aspect ratio always matches the sheet. */
export type DiagramView = DiagramRect;

export const DIAGRAM_DEFAULT_VIEW: DiagramView = DIAGRAM_FULL_VIEW_BOX;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function diagramViewZoom(view: DiagramView): number {
  if (view.width <= 0) return DIAGRAM_MAX_ZOOM;
  return clamp(DIAGRAM_CANVAS_WIDTH / view.width, DIAGRAM_MIN_ZOOM, DIAGRAM_MAX_ZOOM);
}

export function clampDiagramView(view: DiagramView): DiagramView {
  const zoom = diagramViewZoom(view);
  const width = DIAGRAM_CANVAS_WIDTH / zoom;
  const height = DIAGRAM_CANVAS_HEIGHT / zoom;
  return {
    x: clamp(view.x, 0, DIAGRAM_CANVAS_WIDTH - width),
    y: clamp(view.y, 0, DIAGRAM_CANVAS_HEIGHT - height),
    width,
    height,
  };
}

export function isDefaultDiagramView(view: DiagramView): boolean {
  return view.x === 0 && view.y === 0 && view.width === DIAGRAM_CANVAS_WIDTH;
}

/**
 * Zoom by `factor`, keeping `anchor` (a sheet point, normally the cursor) pinned
 * to the same spot on screen. Without an anchor the view centre stays put.
 */
export function zoomDiagramView(
  view: DiagramView,
  factor: number,
  anchor?: DiagramPoint,
): DiagramView {
  const current = diagramViewZoom(view);
  const next = clamp(current * factor, DIAGRAM_MIN_ZOOM, DIAGRAM_MAX_ZOOM);
  const width = DIAGRAM_CANVAS_WIDTH / next;
  const height = DIAGRAM_CANVAS_HEIGHT / next;

  const focus = anchor ?? { x: view.x + view.width / 2, y: view.y + view.height / 2 };
  const ratioX = view.width > 0 ? clamp((focus.x - view.x) / view.width, 0, 1) : 0.5;
  const ratioY = view.height > 0 ? clamp((focus.y - view.y) / view.height, 0, 1) : 0.5;

  return clampDiagramView({
    x: focus.x - ratioX * width,
    y: focus.y - ratioY * height,
    width,
    height,
  });
}

/** `delta` is how far the pointer moved in sheet units; the content follows it. */
export function panDiagramView(view: DiagramView, delta: DiagramPoint): DiagramView {
  return clampDiagramView({ ...view, x: view.x - delta.x, y: view.y - delta.y });
}

export function fitDiagramView(nodes: readonly DiagramNode[]): DiagramView {
  if (nodes.length === 0) return DIAGRAM_DEFAULT_VIEW;

  const boxes = nodes.map(nodeBounds);
  const left = Math.min(...boxes.map((box) => box.x)) - FIT_PADDING;
  const right = Math.max(...boxes.map((box) => box.x + box.width)) + FIT_PADDING;
  const top = Math.min(...boxes.map((box) => box.y)) - FIT_PADDING;
  const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + FIT_PADDING;

  const contentWidth = Math.max(1, right - left);
  const contentHeight = Math.max(1, bottom - top);
  const zoom = clamp(
    Math.min(DIAGRAM_CANVAS_WIDTH / contentWidth, DIAGRAM_CANVAS_HEIGHT / contentHeight),
    DIAGRAM_MIN_ZOOM,
    DIAGRAM_MAX_ZOOM,
  );
  const width = DIAGRAM_CANVAS_WIDTH / zoom;
  const height = DIAGRAM_CANVAS_HEIGHT / zoom;

  return clampDiagramView({
    x: (left + right) / 2 - width / 2,
    y: (top + bottom) / 2 - height / 2,
    width,
    height,
  });
}

export function diagramViewBoxAttribute(view: DiagramView): string {
  return `${view.x} ${view.y} ${view.width} ${view.height}`;
}

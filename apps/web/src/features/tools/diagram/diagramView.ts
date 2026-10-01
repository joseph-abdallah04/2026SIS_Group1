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

/**
 * The levels a zoom button, Ctrl/Cmd +/-, or one click of a mouse wheel moves
 * between.
 *
 * A ladder rather than one fixed factor, for two reasons. A factor large enough
 * to get from 100% to 400% in a handful of clicks felt like a lurch at the low
 * end, where most work happens; a small one took a dozen clicks to get across.
 * Finer steps low down and coarser ones high up fixes both. And every stop is
 * a round percentage, so stepping back and forth lands on the same levels
 * instead of drifting through 156%, 195%, 244%.
 */
export const DIAGRAM_ZOOM_STOPS: readonly number[] = [1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4];

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

/**
 * One stop in or out along `DIAGRAM_ZOOM_STOPS`, keeping `anchor` pinned as
 * `zoomDiagramView` does. A zoom that sits between stops — after a trackpad
 * pinch — moves to the next stop in that direction rather than a full step
 * past it, so the first click after a pinch never skips a level.
 */
export function stepDiagramView(
  view: DiagramView,
  direction: 'in' | 'out',
  anchor?: DiagramPoint,
): DiagramView {
  const current = diagramViewZoom(view);
  // Tolerant of the float error a view width carries, so sitting on a stop
  // counts as being on it.
  const epsilon = 1e-6;
  const target =
    direction === 'in'
      ? (DIAGRAM_ZOOM_STOPS.find((stop) => stop > current + epsilon) ?? DIAGRAM_MAX_ZOOM)
      : ([...DIAGRAM_ZOOM_STOPS].reverse().find((stop) => stop < current - epsilon) ??
        DIAGRAM_MIN_ZOOM);
  return zoomDiagramView(view, target / current, anchor);
}

/**
 * Scene units per CSS pixel, for a view drawn into a surface this size.
 *
 * Anything that should look and feel the same size at every zoom — a handle, a
 * grab band, a snap catchment — is written in pixels and converted with this.
 * Before the surface has been measured it answers 1, which is right at 100%.
 */
export function scenePerPixel(
  view: { width: number; height: number },
  surface: { width: number; height: number },
): number {
  if (surface.width <= 0 || surface.height <= 0) return 1;
  return Math.max(view.width / surface.width, view.height / surface.height);
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

/**
 * The view as it is actually drawn, widened or heightened to the shape of the
 * surface it is drawn on.
 *
 * The canvas fills the window and the sheet does not, so the two rarely share a
 * shape. Rather than letterbox the difference into dead margins, the view takes
 * it: what you see extends past the sheet, which reads as room around the
 * drawing instead of a frame around the canvas.
 *
 * Only what is *visible* grows. The sheet is unchanged, and nothing can be made
 * off it — the canvas clamps every press to it — so this buys the space without
 * touching what an artifact is allowed to contain.
 *
 * Centred on the view it was given, so zooming and panning still mean what they
 * meant: this is a presentation of the view, not a replacement for it.
 */
export function expandViewToAspect(view: DiagramView, aspect: number): DiagramView {
  if (!Number.isFinite(aspect) || aspect <= 0 || view.width <= 0 || view.height <= 0) return view;

  const current = view.width / view.height;
  if (Math.abs(current - aspect) < 1e-6) return view;

  if (current < aspect) {
    const width = view.height * aspect;
    return { x: view.x - (width - view.width) / 2, y: view.y, width, height: view.height };
  }
  const height = view.width / aspect;
  return { x: view.x, y: view.y - (height - view.height) / 2, width: view.width, height };
}

export function diagramViewBoxAttribute(view: DiagramView): string {
  return `${view.x} ${view.y} ${view.width} ${view.height}`;
}

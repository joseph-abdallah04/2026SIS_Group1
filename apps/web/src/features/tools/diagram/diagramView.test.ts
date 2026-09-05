import type { DiagramNode } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import {
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CANVAS_WIDTH,
  clientPointToDiagramPoint,
} from './diagramModel';
import {
  DIAGRAM_DEFAULT_VIEW,
  DIAGRAM_MAX_ZOOM,
  DIAGRAM_MIN_ZOOM,
  clampDiagramView,
  diagramViewBoxAttribute,
  diagramViewZoom,
  fitDiagramView,
  isDefaultDiagramView,
  panDiagramView,
  zoomDiagramView,
} from './diagramView';

const CENTER = { x: DIAGRAM_CANVAS_WIDTH / 2, y: DIAGRAM_CANVAS_HEIGHT / 2 };

function node(id: string, x: number, y: number, shape?: DiagramNode['shape']): DiagramNode {
  return { id, label: id, x, y, shape };
}

describe('diagram view', () => {
  it('starts showing the whole sheet at 100%', () => {
    expect(diagramViewZoom(DIAGRAM_DEFAULT_VIEW)).toBe(1);
    expect(isDefaultDiagramView(DIAGRAM_DEFAULT_VIEW)).toBe(true);
    expect(diagramViewBoxAttribute(DIAGRAM_DEFAULT_VIEW)).toBe(
      `0 0 ${DIAGRAM_CANVAS_WIDTH} ${DIAGRAM_CANVAS_HEIGHT}`,
    );
  });

  it('keeps the anchor point under the cursor while zooming', () => {
    const anchor = { x: 720, y: 450 };
    const zoomed = zoomDiagramView(DIAGRAM_DEFAULT_VIEW, 2, anchor);

    expect(diagramViewZoom(zoomed)).toBe(2);
    const ratioX = (anchor.x - zoomed.x) / zoomed.width;
    const ratioY = (anchor.y - zoomed.y) / zoomed.height;
    expect(ratioX).toBeCloseTo(anchor.x / DIAGRAM_CANVAS_WIDTH, 5);
    expect(ratioY).toBeCloseTo(anchor.y / DIAGRAM_CANVAS_HEIGHT, 5);
  });

  it('never zooms past the bounds in either direction', () => {
    let view = DIAGRAM_DEFAULT_VIEW;
    for (let step = 0; step < 20; step += 1) view = zoomDiagramView(view, 1.5, CENTER);
    expect(diagramViewZoom(view)).toBe(DIAGRAM_MAX_ZOOM);

    for (let step = 0; step < 20; step += 1) view = zoomDiagramView(view, 0.5, CENTER);
    expect(diagramViewZoom(view)).toBe(DIAGRAM_MIN_ZOOM);
    // Zooming all the way back out lands exactly on the whole sheet again.
    expect(isDefaultDiagramView(view)).toBe(true);
  });

  it('keeps the visible slice inside the sheet when panning', () => {
    const zoomed = zoomDiagramView(DIAGRAM_DEFAULT_VIEW, 2, CENTER);
    expect(zoomed).toMatchObject({ x: 240, y: 150, width: 480, height: 300 });

    expect(panDiagramView(zoomed, { x: 100, y: 50 })).toMatchObject({ x: 140, y: 100 });
    // Dragging far past the edge stops at the edge instead of revealing void.
    expect(panDiagramView(zoomed, { x: 5_000, y: 5_000 })).toMatchObject({ x: 0, y: 0 });
    expect(panDiagramView(zoomed, { x: -5_000, y: -5_000 })).toMatchObject({ x: 480, y: 300 });
  });

  it('cannot pan at all while the whole sheet is visible', () => {
    expect(panDiagramView(DIAGRAM_DEFAULT_VIEW, { x: 300, y: 300 })).toEqual(DIAGRAM_DEFAULT_VIEW);
  });

  it('fits tight content without leaving the sheet', () => {
    const view = fitDiagramView([node('a', 700, 420, 'box'), node('b', 780, 480, 'box')]);

    expect(diagramViewZoom(view)).toBeGreaterThan(1);
    expect(view.x).toBeGreaterThanOrEqual(0);
    expect(view.y).toBeGreaterThanOrEqual(0);
    expect(view.x + view.width).toBeLessThanOrEqual(DIAGRAM_CANVAS_WIDTH + 1e-9);
    expect(view.y + view.height).toBeLessThanOrEqual(DIAGRAM_CANVAS_HEIGHT + 1e-9);
    // Both nodes stay inside the fitted slice.
    expect(view.x).toBeLessThanOrEqual(700);
    expect(view.x + view.width).toBeGreaterThanOrEqual(780 + 120);
  });

  it('fits content that already spans the sheet back to 100%', () => {
    const view = fitDiagramView([node('a', 0, 0, 'box'), node('b', 840, 544, 'box')]);
    expect(isDefaultDiagramView(view)).toBe(true);
  });

  it('falls back to the whole sheet for an empty diagram', () => {
    expect(fitDiagramView([])).toEqual(DIAGRAM_DEFAULT_VIEW);
  });

  it('repairs a view that is out of bounds or out of range', () => {
    const repaired = clampDiagramView({ x: -500, y: 900, width: 10, height: 6.25 });
    expect(diagramViewZoom(repaired)).toBe(DIAGRAM_MAX_ZOOM);
    expect(repaired.x).toBe(0);
    expect(repaired.y).toBe(DIAGRAM_CANVAS_HEIGHT - repaired.height);
  });

  it('maps screen coordinates through the current view', () => {
    const view = zoomDiagramView(DIAGRAM_DEFAULT_VIEW, 2, CENTER);
    const bounds = { left: 0, top: 0, width: 960, height: 600 };

    // The centre of the element is still the centre of the sheet...
    expect(clientPointToDiagramPoint({ x: 480, y: 300 }, bounds, view)).toEqual(CENTER);
    // ...but the top-left corner now shows the middle of the sheet, not (0, 0).
    expect(clientPointToDiagramPoint({ x: 0, y: 0 }, bounds, view)).toEqual({ x: 240, y: 150 });
  });
});

import { describe, expect, it } from 'vitest';
import {
  constrainAngle,
  pathFill,
  pathHandlePoint,
  pathStrokeWidth,
  pathSvgData,
  type PathAnchor,
} from '@roundtable/shared';
import { diagramWriteArtifactSchema } from '@roundtable/shared/schemas';

import {
  anchorWithDraggedHandle,
  draftAnchors,
  finishPathDraft,
  isNearFirstAnchor,
  nextAnchorPoint,
} from './studioPaths';

const corner = (x: number, y: number): PathAnchor => ({ x, y });

describe('constrainAngle', () => {
  it('snaps a near-horizontal drag to true horizontal', () => {
    expect(constrainAngle({ x: 0, y: 0 }, { x: 100, y: 10 })).toEqual({ x: 100.5, y: 0 });
  });

  it('snaps a near-vertical drag to true vertical', () => {
    expect(constrainAngle({ x: 0, y: 0 }, { x: 10, y: 100 })).toEqual({ x: 0, y: 100.5 });
  });

  it('snaps to the diagonal between the axes', () => {
    // 45° falls out of the same rule that gives horizontal and vertical.
    expect(constrainAngle({ x: 0, y: 0 }, { x: 100, y: 90 })).toEqual({ x: 95.1, y: 95.1 });
  });

  it('keeps the distance the pointer travelled rather than projecting onto the axis', () => {
    const constrained = constrainAngle({ x: 0, y: 0 }, { x: 100, y: 10 });
    expect(Math.hypot(constrained.x, constrained.y)).toBeCloseTo(Math.hypot(100, 10), 1);
  });

  it('leaves a zero-length drag alone rather than dividing by nothing', () => {
    expect(constrainAngle({ x: 20, y: 20 }, { x: 20, y: 20 })).toEqual({ x: 20, y: 20 });
  });

  it('measures from the given origin, not from the canvas origin', () => {
    expect(constrainAngle({ x: 50, y: 50 }, { x: 150, y: 60 })).toEqual({ x: 150.5, y: 50 });
  });
});

describe('placing anchors', () => {
  it('drops the first anchor exactly where the pointer is', () => {
    // There is nothing to measure an angle from yet.
    expect(nextAnchorPoint([], { x: 33, y: 77 }, true)).toEqual({ x: 33, y: 77 });
  });

  it('constrains a later anchor against the previous one when shift is held', () => {
    expect(nextAnchorPoint([corner(0, 0)], { x: 100, y: 10 }, true)).toEqual({ x: 100.5, y: 0 });
  });

  it('places freely when shift is not held', () => {
    expect(nextAnchorPoint([corner(0, 0)], { x: 100, y: 10 }, false)).toEqual({ x: 100, y: 10 });
  });
});

describe('dragging out a curve', () => {
  it('mirrors the handles so the anchor is smooth', () => {
    const anchor = anchorWithDraggedHandle(corner(50, 50), { x: 70, y: 40 });
    expect(anchor.out).toEqual({ x: 20, y: -10 });
    expect(anchor.in).toEqual({ x: -20, y: 10 });
  });

  it('leaves a press with no drag as a corner', () => {
    expect(anchorWithDraggedHandle(corner(50, 50), { x: 50, y: 50 })).toEqual({ x: 50, y: 50 });
    expect(anchorWithDraggedHandle(corner(50, 50), null)).toEqual({ x: 50, y: 50 });
  });

  it('resolves a handle to an absolute point, and a missing one to the anchor', () => {
    const smooth = anchorWithDraggedHandle(corner(50, 50), { x: 70, y: 40 });
    expect(pathHandlePoint(smooth, 'out')).toEqual({ x: 70, y: 40 });
    expect(pathHandlePoint(corner(10, 10), 'out')).toEqual({ x: 10, y: 10 });
  });
});

describe('closing a path', () => {
  it('does not offer to close until there is an area to enclose', () => {
    // Two anchors closing on themselves would just double the same segment back.
    expect(isNearFirstAnchor([corner(0, 0), corner(10, 0)], { x: 0, y: 0 }, 10)).toBe(false);
  });

  it('closes when the pointer comes back to the first anchor', () => {
    const anchors = [corner(0, 0), corner(50, 0), corner(50, 50)];
    expect(isNearFirstAnchor(anchors, { x: 3, y: 3 }, 10)).toBe(true);
    expect(isNearFirstAnchor(anchors, { x: 40, y: 40 }, 10)).toBe(false);
  });
});

describe('finishing a draft', () => {
  it('discards a mis-click that placed a single anchor', () => {
    expect(finishPathDraft([corner(10, 10)], false, {})).toBeNull();
  });

  it('keeps two anchors, which is exactly what the line tool makes', () => {
    const path = finishPathDraft([corner(0, 0), corner(40, 40)], false, {});
    expect(path?.anchors).toHaveLength(2);
    expect(path?.closed).toBeUndefined();
  });

  it('marks a closed path so it can be filled', () => {
    const path = finishPathDraft([corner(0, 0), corner(40, 0), corner(40, 40)], true, {
      fillColor: 'blue',
    });
    expect(path?.closed).toBe(true);
    expect(path?.fillColor).toBe('blue');
  });

  it('drops a fill from an open path rather than sending one to be refused', () => {
    // The write path rejects a fill on an open path, so it is never built.
    const path = finishPathDraft([corner(0, 0), corner(40, 40)], false, { fillColor: 'blue' });
    expect(path?.fillColor).toBeUndefined();
    expect(
      diagramWriteArtifactSchema.safeParse({
        type: 'diagram',
        nodes: [],
        edges: [],
        paths: [path],
      }).success,
    ).toBe(true);
  });

  it('produces something the real write contract accepts', () => {
    const path = finishPathDraft([corner(0, 0), corner(40, 40)], false, {
      strokeColor: 'ink',
      strokeWidthPreset: 'thick',
    });
    expect(
      diagramWriteArtifactSchema.safeParse({
        type: 'diagram',
        nodes: [],
        edges: [],
        paths: [path],
      }).success,
    ).toBe(true);
  });
});

describe('path rendering', () => {
  it('draws a straight run with a line command rather than a flat curve', () => {
    expect(pathSvgData({ anchors: [corner(0, 0), corner(10, 10)] })).toBe('M 0 0 L 10 10');
  });

  it('draws a cubic once an anchor has a handle', () => {
    const anchors = [{ x: 0, y: 0, out: { x: 10, y: 0 } }, corner(20, 20)];
    expect(pathSvgData({ anchors })).toBe('M 0 0 C 10 0 20 20 20 20');
  });

  it('joins a closed path back to its first anchor', () => {
    const data = pathSvgData({
      anchors: [corner(0, 0), corner(40, 0), corner(40, 40)],
      closed: true,
    });
    expect(data.endsWith('L 0 0 Z')).toBe(true);
  });

  it('paints a lone anchor as a dot rather than nothing', () => {
    expect(pathSvgData({ anchors: [corner(3, 4)] })).toBe('M 3 4 l 0.1 0');
  });

  it('previews the segment being aimed without committing it', () => {
    const preview = draftAnchors([corner(0, 0)], { x: 50, y: 50 });
    expect(preview).toHaveLength(2);
    expect(preview.at(-1)).toEqual({ x: 50, y: 50 });
    // With no pointer there is nothing provisional to show.
    expect(draftAnchors([corner(0, 0)], null)).toHaveLength(1);
  });

  it('fills only a closed path, and uses the arrow width scale', () => {
    expect(pathFill({ closed: true, fillColor: 'blue' })).not.toBe('none');
    expect(pathFill({ closed: false, fillColor: 'blue' })).toBe('none');
    expect(pathStrokeWidth({ strokeWidthPreset: 'thick' })).toBe(3.5);
  });
});

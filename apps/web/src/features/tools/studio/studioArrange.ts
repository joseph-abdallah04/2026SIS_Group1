// Aligning and distributing anything on the canvas, not only shapes.
//
// The properties bar offers alignment to *any* multi-selection, including one
// whose members share no property at all — a stroke and a table have nothing to
// style in common, but they can still be lined up. That only works if arranging
// is expressed over bounding boxes rather than over nodes, which is what this
// module does: it takes boxes in, and gives back how far each one has to move.
//
// Offsets rather than positions, because every kind moves differently. A node
// takes new coordinates, a stroke shifts every point, a path shifts its anchors
// and a table its origin — the caller knows how to move its own kinds, and only
// needs to be told by how much.

export type StudioAlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
export type StudioDistributeAxis = 'horizontal' | 'vertical';

export interface ArrangeBox {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrangeOffset {
  x: number;
  y: number;
}

/**
 * How far each box has to move to line up on one edge or centre.
 *
 * Exact, and deliberately never snapped afterwards: rounding a shared edge onto
 * the grid moves differently sized elements by different amounts and undoes the
 * alignment that was just computed.
 *
 * Fewer than two boxes have nothing to align to, so nothing moves.
 */
export function alignOffsets(
  boxes: readonly ArrangeBox[],
  mode: StudioAlignMode,
): Map<string, ArrangeOffset> {
  const offsets = new Map<string, ArrangeOffset>();
  if (boxes.length < 2) return offsets;

  const left = Math.min(...boxes.map((box) => box.x));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const top = Math.min(...boxes.map((box) => box.y));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));

  for (const box of boxes) {
    let x = box.x;
    let y = box.y;
    switch (mode) {
      case 'left':
        x = left;
        break;
      case 'centerX':
        x = (left + right) / 2 - box.width / 2;
        break;
      case 'right':
        x = right - box.width;
        break;
      case 'top':
        y = top;
        break;
      case 'centerY':
        y = (top + bottom) / 2 - box.height / 2;
        break;
      case 'bottom':
        y = bottom - box.height;
        break;
    }
    offsets.set(box.key, { x: x - box.x, y: y - box.y });
  }
  return offsets;
}

/**
 * How far each box has to move for equal gaps between them.
 *
 * The outermost two stay where they are — they define the span — and everything
 * between them is spread evenly by bounding box, so a wide element and a narrow
 * one end up with the same air around them rather than the same pitch.
 *
 * Fewer than three boxes have no space between them to even out.
 */
export function distributeOffsets(
  boxes: readonly ArrangeBox[],
  axis: StudioDistributeAxis,
): Map<string, ArrangeOffset> {
  const offsets = new Map<string, ArrangeOffset>();
  if (boxes.length < 3) return offsets;

  const horizontal = axis === 'horizontal';
  const extent = (box: ArrangeBox) => (horizontal ? box.width : box.height);
  const start = (box: ArrangeBox) => (horizontal ? box.x : box.y);

  const ordered = [...boxes].sort((a, b) => start(a) - start(b));
  const first = ordered[0]!;
  const last = ordered.at(-1)!;
  const spanStart = start(first);
  const spanEnd = start(last) + extent(last);
  const totalExtent = ordered.reduce((sum, box) => sum + extent(box), 0);
  const gap = (spanEnd - spanStart - totalExtent) / (ordered.length - 1);

  let cursor = spanStart;
  for (const box of ordered) {
    const delta = cursor - start(box);
    offsets.set(box.key, horizontal ? { x: delta, y: 0 } : { x: 0, y: delta });
    cursor += extent(box) + gap;
  }
  return offsets;
}

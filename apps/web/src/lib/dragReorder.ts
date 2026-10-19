/**
 * The geometry of dragging one row of a list to another place, shared by the
 * board's agenda rail and the session setup form so the two feel the same.
 *
 * The rows are measured once, as the drag begins. The dragged row follows the
 * pointer, no further than level with the first and last rows, and the rows it
 * passes slide one place towards where it came from, so the gap is always
 * where it would land. Past the ends it gives a little and no more.
 */

/**
 * How long a row takes to slide out of a dragged row's way, or for the dragged
 * one to ease into its place. Long enough to follow by eye, short enough to
 * keep up with the pointer.
 */
export const REORDER_MS = 240;

/** The curve every reorder slide follows. */
export const REORDER_EASING = 'cubic-bezier(0.25, 1, 0.5, 1)';

/** Where the rows a dragged one can trade places with sat when it lifted. */
export interface RowLayout {
  ids: string[];
  boxes: { top: number; bottom: number }[];
  /** The dragged row's index. */
  self: number;
  /** How far a row slides to make room: the dragged row's height and the gap after it. */
  step: number;
  /** How far up and down the dragged row may travel: level with the first and the last. */
  min: number;
  max: number;
}

/**
 * Measured once, as the drag begins: the rows are about to slide, and their
 * boxes from then on would say where they have gone, not where they belong.
 *
 * `attribute` names the data attribute each row carries its id in; the rows
 * are the dragged row's siblings that have it.
 */
export function measureRows(row: HTMLElement, id: string, attribute: string): RowLayout {
  const list = row.parentElement;
  const rows = list ? [...list.querySelectorAll<HTMLElement>(`[${attribute}]`)] : [row];
  const ids = rows.map((element) => element.getAttribute(attribute) ?? '');
  const boxes = rows.map((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom };
  });
  const self = Math.max(0, ids.indexOf(id));
  const gap = list ? Number.parseFloat(getComputedStyle(list).rowGap) || 0 : 0;
  const own = boxAt(boxes, self);
  return {
    ids,
    boxes,
    self,
    step: own.bottom - own.top + gap,
    min: Math.min(0, boxAt(boxes, 0).top - own.top),
    max: Math.max(0, boxAt(boxes, boxes.length - 1).bottom - own.bottom),
  };
}

export function boxAt(boxes: RowLayout['boxes'], index: number) {
  return boxes[index] ?? { top: 0, bottom: 0 };
}

/** The most a dragged row moves past the first or last row it can trade with. */
const RUBBER_MAX = 14;

/**
 * How far a row dragged `overshoot` pixels past its limit actually goes: about
 * a third as far at first, closing on `RUBBER_MAX` however far it is pulled.
 */
export function rubberBand(overshoot: number) {
  return Math.sign(overshoot) * RUBBER_MAX * (1 - Math.exp(-Math.abs(overshoot) / 40));
}

/**
 * Whose place a dragged row takes: the furthest row its leading edge has
 * passed the middle of, going the way it is moving. Edges rather than the
 * dragged row's own middle, which on a row taller than the rest could still
 * sit inside its own place with the row already as far as it can go.
 */
export function landingIndex({ boxes, self }: RowLayout, offset: number) {
  const own = boxAt(boxes, self);
  const middle = (index: number) => (boxAt(boxes, index).top + boxAt(boxes, index).bottom) / 2;
  let target = self;
  if (offset > 0) {
    for (let i = self + 1; i < boxes.length; i++) {
      if (middle(i) <= own.bottom + offset) target = i;
    }
  } else if (offset < 0) {
    for (let i = self - 1; i >= 0; i--) {
      if (middle(i) >= own.top + offset) target = i;
    }
  }
  return target;
}

/** How far the dragged row travels to sit in the gap opened at `target`. */
export function landingOffset({ boxes, self }: RowLayout, target: number) {
  const own = boxAt(boxes, self);
  const there = boxAt(boxes, target);
  return target > self ? there.bottom - own.bottom : there.top - own.top;
}

/**
 * How far each row between the dragged one's place and `target` slides: one
 * place towards where the dragged row came from. Rows not listed stay put.
 */
export function slideShifts({ ids, self, step }: RowLayout, target: number) {
  const shifts: Record<string, number> = {};
  for (let i = Math.min(self, target); i <= Math.max(self, target); i++) {
    const id = ids[i];
    if (i !== self && id) shifts[id] = target > self ? -step : step;
  }
  return shifts;
}

/** The order the rows would be in with the dragged row dropped at `target`. */
export function droppedOrder({ ids, self }: RowLayout, target: number) {
  const moved = ids[self];
  if (moved === undefined) return ids;
  const order = ids.filter((_, index) => index !== self);
  order.splice(target, 0, moved);
  return order;
}

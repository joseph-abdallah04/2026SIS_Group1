// The controls round a selected table: where rows and columns are added, and
// the lines between them that can be pulled.
//
// Drawn in the canvas's own coordinates but sized in pixels (`pixel` is one CSS
// pixel in scene units), so the controls are the same to see and to hit at every
// zoom — the rule every other piece of studio chrome follows. The editor draws
// this above every element, so nothing painted over the table can cover them.
//
// Round the table's left and top edges sit the add buttons, one on every
// boundary including the two outer ones, and each row's and column's handle,
// level with its middle. While every row has room for both, they share one
// lane close to the table. Once rows get too thin for that — made small, or
// zoomed out — that side splits into two lanes, handles inside and buttons
// outside, so the two never crowd each other however thin a row gets.
//
// An add button sleeps until the pointer is over its row or column — in a cell
// or out in the gutter — and then only the one on the nearer edge of that row
// wakes, as a quiet dot. It turns into a "+" when the pointer comes close, the
// same steps the extend buttons round a shape take, and while it shows its
// "+" a line across the table marks exactly where the new row would go. Which ones are awake is written straight onto the DOM by
// `updatePointer`, not through state: it runs on every pointer move over the
// canvas, and re-rendering the editor that often to fade a dot would cost more
// than anything else on the page.
//
// A handle — the FigJam grip — wakes the same way. A click on it takes the
// whole row or column; a drag carries it somewhere else.

import { forwardRef, useImperativeHandle, useRef, type PointerEvent, type ReactNode } from 'react';

import {
  tableColumnOffsets,
  tableRowOffsets,
  tableSize,
  type TableElement,
} from '@roundtable/shared';

import { trackIndexAt, type TableAxis } from './studioTables';

/** The one lane buttons and handles share while there is room, from the table's edge. */
const SHARED_LANE_PX = 24;
/** Split in two: handles close in, buttons further out. */
const INNER_LANE_PX = 14;
const OUTER_LANE_PX = 34;
/**
 * The thinnest a row can be, on screen, and still fit a button at its edge and
 * a handle in its middle side by side: a button's half-width and a short
 * handle's half-length, with a little air between them.
 */
const SHARED_LANE_MIN_TRACK_PX = 32;
/** How far the chrome reaches past the table, all told: the bar keeps clear of it. */
export const TABLE_CHROME_REACH_PX = OUTER_LANE_PX + 12;
const DOT_HIT_PX = 8;
const DOT_IDLE_PX = 3;
const DOT_FACE_PX = 9;
const DOT_NEAR_PX = 20;
const GRIP_HIT_PX = 8;
/** A handle is drawn this long at most, and never closer than this to either end. */
const HANDLE_LENGTH_PX = 14;
const HANDLE_THICKNESS_PX = 5;
/** Half the handle lane's width, as a target: clear of the frame's edge band. */
const HANDLE_REACH_PX = 5;
/** How far a handle keeps from the ends of its track: clear of the buttons on a shared lane. */
const HANDLE_CLEARANCE_SHARED_PX = 11;
const HANDLE_CLEARANCE_SPLIT_PX = 4;
/** Two tracks thinner than this on screen leave no room for the button between them. */
const DOT_MIN_TRACK_PX = 12;
/** A track shorter than this on screen has no room for a handle between its buttons. */
const HANDLE_MIN_TRACK_PX = 24;

export interface TableChromeHandle {
  /** Where the pointer is, in scene units, or null once it has left the canvas. */
  updatePointer(point: { x: number; y: number } | null): void;
}

interface TableChromeProps {
  table: TableElement;
  /** One CSS pixel, in scene units. */
  pixel: number;
  disabled?: boolean;
  onInsert: (axis: TableAxis, index: number) => void;
  /** A press on the line after `track`, which resizes that row or column. */
  onResizeStart: (event: PointerEvent<SVGGElement>, axis: TableAxis, track: number) => void;
  /** A press on a row's or column's handle: a click selects it, a drag moves it. */
  onHandleDown: (event: PointerEvent<SVGGElement>, axis: TableAxis, track: number) => void;
  /** The whole rows or columns currently selected, whose handles stay lit. */
  selectedTracks?: { axis: TableAxis; start: number; end: number } | null;
}

export const TableChrome = forwardRef<TableChromeHandle, TableChromeProps>(function TableChrome(
  { table, pixel, disabled = false, onInsert, onResizeStart, onHandleDown, selectedTracks = null },
  ref,
) {
  const dots = useRef(new Map<string, SVGGElement>());
  const handles = useRef(new Map<string, SVGGElement>());
  const colOffsets = tableColumnOffsets(table);
  const rowOffsets = tableRowOffsets(table);
  const size = tableSize(table);
  // Each side decides for itself: tall rows share a lane even when narrow
  // columns have had to split theirs.
  const lanesFor = (offsets: readonly number[]) => {
    const shared = offsets
      .slice(1)
      .every((edge, index) => edge - (offsets[index] ?? 0) >= SHARED_LANE_MIN_TRACK_PX * pixel);
    return shared
      ? { shared, dot: SHARED_LANE_PX * pixel, handle: SHARED_LANE_PX * pixel }
      : { shared, dot: OUTER_LANE_PX * pixel, handle: INNER_LANE_PX * pixel };
  };
  const lanes = { row: lanesFor(rowOffsets), col: lanesFor(colOffsets) };

  useImperativeHandle(ref, () => ({
    updatePointer(point) {
      let hotRow = -1;
      let hotCol = -1;
      const local = point ? { x: point.x - table.x, y: point.y - table.y } : null;
      if (local) {
        // Over the table or out in its gutter, but not beyond it.
        const reach = TABLE_CHROME_REACH_PX * pixel;
        if (local.x >= -reach && local.x <= size.width) hotRow = trackIndexAt(rowOffsets, local.y);
        if (local.y >= -reach && local.y <= size.height) hotCol = trackIndexAt(colOffsets, local.x);
      }
      // The boundary of the row or column under the pointer that the pointer
      // is nearer: the upper half of a row wakes the button above it, the lower
      // half the one below. One button at a time, not a pair crowding a thin row.
      const nearerEdge = (offsets: readonly number[], track: number, at: number) => {
        if (track === -1) return -1;
        const middle = ((offsets[track] ?? 0) + (offsets[track + 1] ?? 0)) / 2;
        return at < middle ? track : track + 1;
      };
      const hotRowEdge = local ? nearerEdge(rowOffsets, hotRow, local.y) : -1;
      const hotColEdge = local ? nearerEdge(colOffsets, hotCol, local.x) : -1;
      for (const [key, element] of dots.current) {
        const [axis, at] = key.split(':') as [TableAxis, string];
        const index = Number(at);
        const hot = index === (axis === 'row' ? hotRowEdge : hotColEdge);
        const lane = lanes[axis].dot;
        const centre =
          axis === 'row'
            ? { x: -lane, y: rowOffsets[index] ?? 0 }
            : { x: colOffsets[index] ?? 0, y: -lane };
        const near =
          local !== null &&
          Math.hypot(local.x - centre.x, local.y - centre.y) <= DOT_NEAR_PX * pixel;
        if (hot) element.dataset.hot = 'true';
        else delete element.dataset.hot;
        if (near) element.dataset.near = 'true';
        else delete element.dataset.near;
      }
      for (const [key, element] of handles.current) {
        const [axis, at] = key.split(':') as [TableAxis, string];
        const hot = Number(at) === (axis === 'row' ? hotRow : hotCol);
        if (hot) element.dataset.hot = 'true';
        else delete element.dataset.hot;
      }
    },
  }));

  function dot(axis: TableAxis, index: number, label: string, x: number, y: number): ReactNode {
    const offsets = axis === 'row' ? rowOffsets : colOffsets;
    // Squeezed between two tracks too thin to show it, a button would sit on
    // top of its neighbours; it steps aside until the zoom gives it room.
    const before = index > 0 ? (offsets[index] ?? 0) - (offsets[index - 1] ?? 0) : Infinity;
    const after =
      index < offsets.length - 1 ? (offsets[index + 1] ?? 0) - (offsets[index] ?? 0) : Infinity;
    const room = DOT_MIN_TRACK_PX * pixel;
    if (before < room && after < room) return null;
    const key = `${axis}:${index}`;
    const arm = 4 * pixel;
    // Across the table on this boundary, in the button's own frame: from the
    // table's near edge, a lane away, to its far one.
    const lane = lanes[axis].dot;
    const line =
      axis === 'row'
        ? { x1: lane, y1: 0, x2: lane + size.width, y2: 0 }
        : { x1: 0, y1: lane, x2: 0, y2: lane + size.height };
    return (
      <g
        key={key}
        ref={(element) => {
          if (element) dots.current.set(key, element);
          else dots.current.delete(key);
        }}
        role="button"
        aria-label={label}
        aria-disabled={disabled || undefined}
        data-testid="table-insert"
        className="rt-table-dot"
        transform={`translate(${x} ${y})`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          if (!disabled) onInsert(axis, index);
        }}
      >
        <line
          className="rt-table-dot-line"
          data-testid="table-insert-line"
          {...line}
          strokeWidth={2 * pixel}
          strokeLinecap="round"
        />
        <circle r={DOT_HIT_PX * pixel} fill="transparent" />
        <circle className="rt-table-dot-idle" r={DOT_IDLE_PX * pixel} />
        <g className="rt-table-dot-face">
          <circle className="rt-table-dot-disc" r={DOT_FACE_PX * pixel} strokeWidth={1.5 * pixel} />
          <path
            className="rt-table-dot-plus"
            d={`M${-arm} 0H${arm}M0 ${-arm}V${arm}`}
            strokeWidth={1.75 * pixel}
            strokeLinecap="round"
          />
        </g>
      </g>
    );
  }

  function grip(axis: TableAxis, boundary: number): ReactNode {
    const at = (axis === 'col' ? colOffsets : rowOffsets)[boundary] ?? 0;
    const hit = GRIP_HIT_PX * pixel;
    const vertical = axis === 'col';
    return (
      <g
        key={`grip-${axis}-${boundary}`}
        role="button"
        aria-label={`Resize ${axis === 'col' ? 'column' : 'row'} ${boundary}`}
        className="rt-table-grip"
        style={{ cursor: vertical ? 'col-resize' : 'row-resize' }}
        onPointerDown={(event) => {
          if (event.button !== 0 || disabled) return;
          onResizeStart(event, axis, boundary - 1);
        }}
      >
        <rect
          x={vertical ? at - hit / 2 : 0}
          y={vertical ? 0 : at - hit / 2}
          width={vertical ? hit : size.width}
          height={vertical ? size.height : hit}
          fill="transparent"
        />
        <line
          className="rt-table-grip-line"
          x1={vertical ? at : 0}
          y1={vertical ? 0 : at}
          x2={vertical ? at : size.width}
          y2={vertical ? size.height : at}
          strokeWidth={2 * pixel}
        />
      </g>
    );
  }

  function handle(axis: TableAxis, track: number): ReactNode {
    const offsets = axis === 'row' ? rowOffsets : colOffsets;
    const from = offsets[track] ?? 0;
    const to = offsets[track + 1] ?? from;
    const extent = to - from;
    if (extent < HANDLE_MIN_TRACK_PX * pixel) return null;
    const key = `${axis}:${track}`;
    const middle = from + extent / 2;
    const clearance =
      (lanes[axis].shared ? HANDLE_CLEARANCE_SHARED_PX : HANDLE_CLEARANCE_SPLIT_PX) * pixel;
    const length = Math.min(HANDLE_LENGTH_PX * pixel, extent - clearance * 2);
    const thickness = HANDLE_THICKNESS_PX * pixel;
    const reach = HANDLE_REACH_PX * pixel;
    const lane = lanes[axis].handle;
    const lit =
      selectedTracks !== null &&
      selectedTracks.axis === axis &&
      track >= selectedTracks.start &&
      track <= selectedTracks.end;
    const label = axis === 'row' ? `Row ${track + 1}` : `Column ${track + 1}`;
    // Laid along the track: a row's handle stands upright in the left gutter,
    // a column's lies flat in the top one.
    const along = (a: number, b: number) => (axis === 'row' ? { x: b, y: a } : { x: a, y: b });
    const hitAt = along(from + clearance, -lane - reach);
    const hitSize = along(extent - clearance * 2, reach * 2);
    const pillAt = along(middle - length / 2, -lane - thickness / 2);
    const pillSize = along(length, thickness);
    return (
      <g
        key={`handle-${key}`}
        ref={(element) => {
          if (element) handles.current.set(key, element);
          else handles.current.delete(key);
        }}
        role="button"
        aria-label={label}
        aria-pressed={lit}
        aria-disabled={disabled || undefined}
        data-testid="table-handle"
        data-selected={lit ? 'true' : undefined}
        className="rt-table-handle"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          if (!disabled) onHandleDown(event, axis, track);
        }}
      >
        <rect x={hitAt.x} y={hitAt.y} width={hitSize.x} height={hitSize.y} fill="transparent" />
        <rect
          className="rt-table-handle-pill"
          x={pillAt.x}
          y={pillAt.y}
          width={pillSize.x}
          height={pillSize.y}
          rx={thickness / 2}
        />
      </g>
    );
  }

  const rows = rowOffsets.length - 1;
  const cols = colOffsets.length - 1;

  return (
    <g data-testid="table-chrome" transform={`translate(${table.x} ${table.y})`}>
      {/* The lines inside the table, never its outline: the outline is the
          frame's, and pulling it moves the outer row or column. */}
      {Array.from({ length: cols - 1 }, (_, index) => grip('col', index + 1))}
      {Array.from({ length: rows - 1 }, (_, index) => grip('row', index + 1))}
      {Array.from({ length: rows }, (_, index) => handle('row', index))}
      {Array.from({ length: cols }, (_, index) => handle('col', index))}
      {Array.from({ length: rows + 1 }, (_, index) =>
        dot(
          'row',
          index,
          index === rows ? 'Add a row' : `Insert a row above row ${index + 1}`,
          -lanes.row.dot,
          rowOffsets[index] ?? 0,
        ),
      )}
      {Array.from({ length: cols + 1 }, (_, index) =>
        dot(
          'col',
          index,
          index === cols ? 'Add a column' : `Insert a column left of column ${index + 1}`,
          colOffsets[index] ?? 0,
          -lanes.col.dot,
        ),
      )}
    </g>
  );
});

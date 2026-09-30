// Table behaviour, as pure functions over a `TableElement`.
//
// Everything a spreadsheet does that is easy to get subtly wrong — where Tab
// goes from the last cell, what happens to widths when a column is removed,
// whether a range is still valid after a row goes — lives here so it can be
// tested without a canvas. The editor supplies the pointer and keyboard events
// and nothing else.

import {
  DIAGRAM_CANVAS_WIDTH,
  TABLE_DEFAULT_COL_WIDTH,
  TABLE_DEFAULT_ROW_HEIGHT,
  TABLE_MAX_COLS,
  TABLE_MAX_COL_WIDTH,
  TABLE_MAX_ROWS,
  TABLE_CELL_PADDING,
  TABLE_CELL_TEXT_LIMIT,
  TABLE_HEADER_FILL,
  TABLE_MAX_ROW_HEIGHT,
  TABLE_MERGE_LIMIT,
  TABLE_MIN_COL_WIDTH,
  TABLE_MIN_ROW_HEIGHT,
  normalizeTableMerges,
  tableAutoRowHeight,
  tableCellArea,
  tableCellAt,
  tableCellFontSize,
  tableCellIndex,
  tableCellIsCovered,
  tableMergeAt,
  tableMergeNeededHeight,
  tableColCount,
  tableColumnOffsets,
  tableRowCount,
  tableRowOffsets,
  tableSize,
  wrapDiagramLabel,
  type DiagramFillKey,
  type DiagramFontSizePreset,
  type DiagramStrokeKey,
  type TableCell,
  type TableCellAlign,
  type TableElement,
  type TableMerge,
} from '@roundtable/shared';

export interface CellRef {
  row: number;
  col: number;
}

/** A rectangular block of cells, as the two corners the user picked. */
export interface CellRange {
  anchor: CellRef;
  focus: CellRef;
  /**
   * Set when whole rows or columns were picked, by their handles. Said out
   * loud rather than worked out from the corners: in a one-column table every
   * cell is a whole row, and Delete there has to clear text, not take rows.
   */
  whole?: 'row' | 'col';
}

export type TableAxis = 'row' | 'col';

/**
 * How wide a new table's columns start.
 *
 * Wider than the stored default, because a new table's text is Medium and a
 * 96-unit column held barely a word of it. Narrower again for a table with many
 * columns, so a new one always fits across the sheet it is placed on.
 */
export const TABLE_NEW_COL_WIDTH = 128;
const TABLE_NEW_SHEET_MARGIN = 48;

export function newTableColWidth(cols: number): number {
  const room = (DIAGRAM_CANVAS_WIDTH - TABLE_NEW_SHEET_MARGIN * 2) / Math.max(1, cols);
  return Math.max(TABLE_MIN_COL_WIDTH, Math.min(TABLE_NEW_COL_WIDTH, Math.floor(room / 8) * 8));
}

export function createTableId(): string {
  return `table-${globalThis.crypto.randomUUID()}`;
}

export function createTable(
  rows: number,
  cols: number,
  position: { x: number; y: number },
): TableElement {
  const safeRows = Math.max(1, Math.min(TABLE_MAX_ROWS, Math.round(rows)));
  const safeCols = Math.max(1, Math.min(TABLE_MAX_COLS, Math.round(cols)));
  return {
    id: createTableId(),
    x: Math.round(position.x),
    y: Math.round(position.y),
    colWidths: Array.from({ length: safeCols }, () => newTableColWidth(safeCols)),
    rowHeights: Array.from({ length: safeRows }, () => TABLE_DEFAULT_ROW_HEIGHT),
    // A grid almost always has headings, so the first row starts tinted. The
    // tint is the cells' own fill rather than a "this is the header" flag:
    // a flag belongs to whichever row is first, so a row dragged to the top
    // took the tint from the one that had been there.
    cells: Array.from({ length: safeRows * safeCols }, (_, index) =>
      index < safeCols ? { fill: TABLE_HEADER_FILL } : {},
    ),
    // The size every new piece of text in the studio starts at.
    fontSizePreset: 'medium',
  };
}

/**
 * A table written with the old heading flag, with that heading made into its
 * first row's own styling — the same tint and weight, so nothing looks any
 * different — and the flag dropped.
 *
 * Done before anything changes which row is first. The flag styles whatever
 * row is at the top, so moving, adding or removing rows under it would move
 * the heading onto a row that is not one. Tables nobody edits that way keep
 * the flag, and keep rendering from it.
 */
export function bakeHeaderRow(table: TableElement): TableElement {
  if (!table.headerRow) return table;
  const cols = tableColCount(table);
  const cells = table.cells.map((cell, index) =>
    index < cols
      ? { ...cell, fill: cell.fill ?? TABLE_HEADER_FILL, bold: cell.bold ?? true }
      : cell,
  );
  const baked = { ...table, cells };
  delete baked.headerRow;
  return baked;
}

/**
 * `edit` run on the table with its heading baked in, but the original handed
 * back when the edit changed nothing — so a refused or empty edit still reads
 * as "no change" and leaves no undo step.
 */
function withHeaderBaked<A extends unknown[]>(
  edit: (table: TableElement, ...args: A) => TableElement,
): (table: TableElement, ...args: A) => TableElement {
  return (table, ...args) => {
    const baked = bakeHeaderRow(table);
    const next = edit(baked, ...args);
    return next === baked ? table : next;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// --- Navigation -----------------------------------------------------------

export type TableNavKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Tab' | 'Enter';

/**
 * Where the selection lands.
 *
 * Arrows stop at the edges — running off the end of a grid and wrapping is
 * disorienting when you are steering by feel. Tab and Enter do wrap, because
 * they are for working *through* a table rather than aiming at a cell: Tab
 * carries on to the next row and round to the first cell from the last, Enter
 * moves down a column and round to the top. Shift reverses either.
 */
export function moveTableSelection(
  table: Pick<TableElement, 'colWidths' | 'rowHeights' | 'merges'>,
  from: CellRef,
  key: TableNavKey,
  shift = false,
): CellRef {
  const rows = tableRowCount(table);
  const cols = tableColCount(table);
  const row = clamp(from.row, 0, rows - 1);
  const col = clamp(from.col, 0, cols - 1);
  // A merged cell is one cell: a step leaves from its far edge, and a step
  // that lands inside one lands on it — its top-left cell, where its text is.
  const area = tableCellArea(table, row, col);
  const land = (next: CellRef) => resolveCell(table, next);

  switch (key) {
    case 'ArrowUp':
      return land({ row: Math.max(0, area.row - 1), col });
    case 'ArrowDown':
      return land({ row: Math.min(rows - 1, area.row + area.rowSpan), col });
    case 'ArrowLeft':
      return land({ row, col: Math.max(0, area.col - 1) });
    case 'ArrowRight':
      return land({ row, col: Math.min(cols - 1, area.col + area.colSpan) });
    case 'Tab': {
      // Through the cells in reading order, passing over the ones a merge covers.
      const total = rows * cols;
      let flat = area.row * cols + area.col;
      for (let step = 0; step < total; step += 1) {
        flat = (flat + (shift ? -1 : 1) + total) % total;
        const next = { row: Math.floor(flat / cols), col: flat % cols };
        if (!tableCellIsCovered(table, next.row, next.col)) return next;
      }
      return { row: area.row, col: area.col };
    }
    case 'Enter': {
      const next = shift ? area.row - 1 : area.row + area.rowSpan;
      return land({ row: (next + rows) % rows, col });
    }
  }
}

/** Every cell inside the rectangle the two corners describe. */
export function cellsInRange(range: CellRange): CellRef[] {
  const top = Math.min(range.anchor.row, range.focus.row);
  const bottom = Math.max(range.anchor.row, range.focus.row);
  const left = Math.min(range.anchor.col, range.focus.col);
  const right = Math.max(range.anchor.col, range.focus.col);

  const cells: CellRef[] = [];
  for (let row = top; row <= bottom; row += 1) {
    for (let col = left; col <= right; col += 1) cells.push({ row, col });
  }
  return cells;
}

export function isCellInRange(range: CellRange, row: number, col: number): boolean {
  const top = Math.min(range.anchor.row, range.focus.row);
  const bottom = Math.max(range.anchor.row, range.focus.row);
  const left = Math.min(range.anchor.col, range.focus.col);
  const right = Math.max(range.anchor.col, range.focus.col);
  return row >= top && row <= bottom && col >= left && col <= right;
}

// --- Cell edits -----------------------------------------------------------

function withCells(table: TableElement, cells: TableCell[]): TableElement {
  return { ...table, cells };
}

export function setCell(
  table: TableElement,
  row: number,
  col: number,
  patch: Partial<TableCell>,
): TableElement {
  const index = tableCellIndex(table, row, col);
  if (index === -1) return table;
  const next = [...table.cells];
  const merged: TableCell = { ...next[index], ...patch };
  // An empty string is not a value worth storing; dropping it keeps a cleared
  // cell identical to one that was never typed in.
  if (merged.text !== undefined && merged.text.trim() === '') delete merged.text;
  next[index] = merged;
  return withCells(table, next);
}

/** Paint a fill across a block, or clear it when `fill` is null. */
export function fillCellRange(
  table: TableElement,
  range: CellRange,
  fill: DiagramFillKey | null,
): TableElement {
  const next = [...table.cells];
  for (const { row, col } of anchorCellsInRange(table, range)) {
    const index = tableCellIndex(table, row, col);
    if (index === -1) continue;
    const cell = { ...next[index] };
    if (fill) cell.fill = fill;
    else delete cell.fill;
    next[index] = cell;
  }
  return withCells(table, next);
}

export function alignCellRange(
  table: TableElement,
  range: CellRange,
  align: TableCellAlign,
): TableElement {
  const next = [...table.cells];
  for (const { row, col } of anchorCellsInRange(table, range)) {
    const index = tableCellIndex(table, row, col);
    if (index === -1) continue;
    next[index] = { ...next[index], align };
  }
  return withCells(table, next);
}

/** Apply text styling across a block — size, weight or colour. */
export function styleCellRange(
  table: TableElement,
  range: CellRange,
  style: {
    bold?: boolean;
    color?: DiagramStrokeKey | null;
    fontSizePreset?: DiagramFontSizePreset;
  },
): TableElement {
  const next = [...table.cells];
  for (const { row, col } of anchorCellsInRange(table, range)) {
    const index = tableCellIndex(table, row, col);
    if (index === -1) continue;
    const cell: TableCell = { ...next[index] };
    if (style.bold !== undefined) {
      // A heading cell is bold unless it says otherwise, so taking the weight
      // off one has to be said out loud; anywhere else "not bold" is simply
      // the absence of the key.
      const heading = Boolean(table.headerRow) && row === 0;
      if (style.bold) cell.bold = true;
      else if (heading) cell.bold = false;
      else delete cell.bold;
    }
    if (style.color !== undefined) {
      if (style.color) cell.color = style.color;
      else delete cell.color;
    }
    if (style.fontSizePreset !== undefined) cell.fontSizePreset = style.fontSizePreset;
    next[index] = cell;
  }
  return withCells(table, next);
}

export function clearCellRange(table: TableElement, range: CellRange): TableElement {
  const next = [...table.cells];
  for (const { row, col } of anchorCellsInRange(table, range)) {
    const index = tableCellIndex(table, row, col);
    if (index === -1) continue;
    const cell = { ...next[index] };
    delete cell.text;
    next[index] = cell;
  }
  return withCells(table, next);
}

// --- Structure ------------------------------------------------------------

export const insertRow = withHeaderBaked(function insertRow(
  table: TableElement,
  at: number,
): TableElement {
  const rows = tableRowCount(table);
  const cols = tableColCount(table);
  if (rows >= TABLE_MAX_ROWS) return table;
  const index = clamp(at, 0, rows);

  const rowHeights = [...table.rowHeights];
  rowHeights.splice(
    index,
    0,
    table.rowHeights[Math.min(index, rows - 1)] ?? TABLE_DEFAULT_ROW_HEIGHT,
  );

  const cells = [...table.cells];
  cells.splice(index * cols, 0, ...Array.from({ length: cols }, () => ({}) as TableCell));
  return withMerges({ ...table, rowHeights, cells }, shiftMergesForInsert(table, 'row', index));
});

export const deleteRow = withHeaderBaked(function deleteRow(
  table: TableElement,
  at: number,
): TableElement {
  const rows = tableRowCount(table);
  const cols = tableColCount(table);
  // A table with no rows is not a table; the caller deletes the element.
  if (rows <= 1 || at < 0 || at >= rows) return table;

  const rowHeights = table.rowHeights.filter((_, index) => index !== at);
  // A merged cell whose top row goes keeps its content: it moves down to the
  // row that becomes its top.
  const cells = handAnchorsOn(table, 'row', at);
  cells.splice(at * cols, cols);
  return withMerges({ ...table, rowHeights, cells }, shiftMergesForDelete(table, 'row', at));
});

export function insertColumn(table: TableElement, at: number): TableElement {
  const rows = tableRowCount(table);
  const cols = tableColCount(table);
  if (cols >= TABLE_MAX_COLS) return table;
  const index = clamp(at, 0, cols);

  const colWidths = [...table.colWidths];
  colWidths.splice(index, 0, table.colWidths[Math.min(index, cols - 1)] ?? TABLE_DEFAULT_COL_WIDTH);

  // A new column takes each row's look from the cell beside it — its fill,
  // weight, colour, alignment and size, never its text — so a styled row,
  // the heading above all, carries on across the new column unbroken.
  const cells: TableCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    const start = row * cols;
    cells.push(
      ...table.cells.slice(start, start + index),
      cellStyle(table.cells[start + Math.min(index, cols - 1)]),
      ...table.cells.slice(start + index, start + cols),
    );
  }
  return clearCovered(
    withMerges({ ...table, colWidths, cells }, shiftMergesForInsert(table, 'col', index)),
  );
}

/** A cell's look without its text. */
function cellStyle(cell: TableCell | undefined): TableCell {
  if (!cell) return {};
  const style = { ...cell };
  delete style.text;
  return style;
}

export function deleteColumn(table: TableElement, at: number): TableElement {
  const rows = tableRowCount(table);
  const cols = tableColCount(table);
  if (cols <= 1 || at < 0 || at >= cols) return table;

  const colWidths = table.colWidths.filter((_, index) => index !== at);
  const source = handAnchorsOn(table, 'col', at);
  const cells: TableCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    const start = row * cols;
    for (let col = 0; col < cols; col += 1) {
      if (col !== at) cells.push(source[start + col] ?? {});
    }
  }
  return withMerges({ ...table, colWidths, cells }, shiftMergesForDelete(table, 'col', at));
}

// --- Merged cells -----------------------------------------------------------

/** The table with its merges set, the key dropped when there are none. */
function withMerges(table: TableElement, merges: readonly TableMerge[]): TableElement {
  const next = { ...table };
  const kept = normalizeTableMerges(tableRowCount(table), tableColCount(table), merges);
  if (kept.length > 0) next.merges = kept;
  else delete next.merges;
  return next;
}

/** Every cell a merge covers emptied, as the contract has them. */
function clearCovered(table: TableElement): TableElement {
  if (!table.merges?.length) return table;
  const cols = tableColCount(table);
  const cells = table.cells.map((cell, index) =>
    tableCellIsCovered(table, Math.floor(index / cols), index % cols) ? {} : cell,
  );
  return { ...table, cells };
}

function mergeSpan(merge: TableMerge, axis: TableAxis): { start: number; end: number } {
  return axis === 'row'
    ? { start: merge.row, end: merge.row + merge.rowSpan - 1 }
    : { start: merge.col, end: merge.col + merge.colSpan - 1 };
}

function withSpan(merge: TableMerge, axis: TableAxis, start: number, end: number): TableMerge {
  return axis === 'row'
    ? { ...merge, row: start, rowSpan: end - start + 1 }
    : { ...merge, col: start, colSpan: end - start + 1 };
}

/**
 * The merges after a row or column is put in at `at`. One in front of a merge
 * moves it along; one strictly inside it makes it span one more, as a
 * spreadsheet's does — the merged cell stays one cell, only bigger.
 */
function shiftMergesForInsert(table: TableElement, axis: TableAxis, at: number): TableMerge[] {
  return (table.merges ?? []).map((merge) => {
    const { start, end } = mergeSpan(merge, axis);
    if (at <= start) return withSpan(merge, axis, start + 1, end + 1);
    if (at <= end) return withSpan(merge, axis, start, end + 1);
    return merge;
  });
}

/**
 * The merges after the row or column at `at` is taken out: those past it move
 * back, one it runs through spans one fewer, and one that shrinks to a single
 * cell is no longer a merge at all.
 */
function shiftMergesForDelete(table: TableElement, axis: TableAxis, at: number): TableMerge[] {
  return (table.merges ?? []).flatMap((merge) => {
    const { start, end } = mergeSpan(merge, axis);
    if (at < start) return [withSpan(merge, axis, start - 1, end - 1)];
    if (at <= end) {
      if (start === end) return [];
      return [withSpan(merge, axis, start, end - 1)];
    }
    return [merge];
  });
}

/**
 * The cells, with every merged cell whose top row (or first column) is at `at`
 * handed on to the next one first — so taking that row out takes a row of the
 * merged cell, not its contents.
 */
function handAnchorsOn(table: TableElement, axis: TableAxis, at: number): TableCell[] {
  const cells = [...table.cells];
  for (const merge of table.merges ?? []) {
    const { start, end } = mergeSpan(merge, axis);
    if (start !== at || end === start) continue;
    const from = tableCellIndex(table, merge.row, merge.col);
    const to =
      axis === 'row'
        ? tableCellIndex(table, merge.row + 1, merge.col)
        : tableCellIndex(table, merge.row, merge.col + 1);
    if (from === -1 || to === -1) continue;
    cells[to] = cells[from] ?? {};
  }
  return cells;
}

/** The cell a reference stands for: a merged cell's top-left, where its content is. */
export function resolveCell(table: Pick<TableElement, 'merges'>, ref: CellRef): CellRef {
  const merge = tableMergeAt(table, ref.row, ref.col);
  return merge ? { row: merge.row, col: merge.col } : ref;
}

/**
 * A range grown until no merged cell sticks out of it: a selection takes a
 * merged cell whole or not at all. Grown again after each merge it swallows,
 * since that can reach another. Keeps the way it was dragged.
 */
export function expandRangeToMerges(
  table: Pick<TableElement, 'merges'>,
  range: CellRange,
): CellRange {
  const merges = table.merges ?? [];
  if (merges.length === 0) return range;
  let { start: top, end: bottom } = trackSpan(range, 'row');
  let { start: left, end: right } = trackSpan(range, 'col');
  let grown = true;
  while (grown) {
    grown = false;
    for (const merge of merges) {
      const rows = mergeSpan(merge, 'row');
      const cols = mergeSpan(merge, 'col');
      if (rows.start > bottom || rows.end < top || cols.start > right || cols.end < left) continue;
      if (rows.start < top) [top, grown] = [rows.start, true];
      if (rows.end > bottom) [bottom, grown] = [rows.end, true];
      if (cols.start < left) [left, grown] = [cols.start, true];
      if (cols.end > right) [right, grown] = [cols.end, true];
    }
  }
  const down = range.anchor.row <= range.focus.row;
  const across = range.anchor.col <= range.focus.col;
  return {
    ...range,
    anchor: { row: down ? top : bottom, col: across ? left : right },
    focus: { row: down ? bottom : top, col: across ? right : left },
  };
}

/** The cells of a range that show: every cell but those a merge covers. */
export function anchorCellsInRange(
  table: Pick<TableElement, 'merges'>,
  range: CellRange,
): CellRef[] {
  return cellsInRange(range).filter(({ row, col }) => !tableCellIsCovered(table, row, col));
}

/** Whether a range is exactly one merged cell. */
function rangeIsOneMerge(table: Pick<TableElement, 'merges'>, range: CellRange): boolean {
  const rows = trackSpan(range, 'row');
  const cols = trackSpan(range, 'col');
  const merge = tableMergeAt(table, rows.start, cols.start);
  return (
    merge !== null &&
    merge.row === rows.start &&
    merge.col === cols.start &&
    merge.rowSpan === rows.end - rows.start + 1 &&
    merge.colSpan === cols.end - cols.start + 1
  );
}

/**
 * What the merge control does for a range: undo one merged cell held on its
 * own, merge anything bigger than one cell, or nothing.
 */
export function mergeAction(
  table: Pick<TableElement, 'merges'>,
  range: CellRange,
): 'merge' | 'unmerge' | null {
  if (rangeIsOneMerge(table, range)) return 'unmerge';
  return cellsInRange(expandRangeToMerges(table, range)).length > 1 ? 'merge' : null;
}

/**
 * The cells of a range made into one. The top-left cell's content and look are
 * the merged cell's; everything else in the range is cleared, as a spreadsheet
 * does. Merges inside it are absorbed. The same table back for a single cell,
 * or when the table already holds as many merges as it may.
 */
export function mergeCells(table: TableElement, range: CellRange): TableElement {
  const area = expandRangeToMerges(table, range);
  const rows = trackSpan(area, 'row');
  const cols = trackSpan(area, 'col');
  const merge: TableMerge = {
    row: rows.start,
    col: cols.start,
    rowSpan: rows.end - rows.start + 1,
    colSpan: cols.end - cols.start + 1,
  };
  if (merge.rowSpan * merge.colSpan <= 1) return table;
  const inside = (other: TableMerge) =>
    other.row >= rows.start &&
    other.row + other.rowSpan - 1 <= rows.end &&
    other.col >= cols.start &&
    other.col + other.colSpan - 1 <= cols.end;
  const kept = (table.merges ?? []).filter((other) => !inside(other));
  if (kept.length >= TABLE_MERGE_LIMIT) return table;
  const cells = [...table.cells];
  for (const { row, col } of cellsInRange(area)) {
    if (row === merge.row && col === merge.col) continue;
    const index = tableCellIndex(table, row, col);
    if (index !== -1) cells[index] = {};
  }
  return withMerges({ ...table, cells }, [...kept, merge]);
}

/** Every merged cell a range touches split back into its cells. */
export function unmergeCells(table: TableElement, range: CellRange): TableElement {
  const rows = trackSpan(range, 'row');
  const cols = trackSpan(range, 'col');
  const merges = table.merges ?? [];
  const kept = merges.filter((merge) => {
    const r = mergeSpan(merge, 'row');
    const c = mergeSpan(merge, 'col');
    return r.start > rows.end || r.end < rows.start || c.start > cols.end || c.end < cols.start;
  });
  return kept.length === merges.length ? table : withMerges(table, kept);
}

/** Whether boundary `at` (0 before the first track) runs through the middle of a merge. */
export function boundaryInsideMerge(
  table: Pick<TableElement, 'merges'>,
  axis: TableAxis,
  at: number,
): boolean {
  return (table.merges ?? []).some((merge) => {
    const { start, end } = mergeSpan(merge, axis);
    return start < at && at <= end;
  });
}

/** Whether tracks `start`..`end` take part of a merge without the rest of it. */
export function blockCutsMerge(
  table: Pick<TableElement, 'merges'>,
  axis: TableAxis,
  start: number,
  end: number,
): boolean {
  return (table.merges ?? []).some((merge) => {
    const span = mergeSpan(merge, axis);
    const overlaps = span.start <= end && span.end >= start;
    return overlaps && (span.start < start || span.end > end);
  });
}

/**
 * Whether tracks can be carried to boundary `to`: only merged cells whole, and
 * never into the middle of one — either would tear a merged cell in two.
 */
export function canMoveTracks(
  table: Pick<TableElement, 'merges'>,
  axis: TableAxis,
  start: number,
  end: number,
  to: number,
): boolean {
  return !blockCutsMerge(table, axis, start, end) && !boundaryInsideMerge(table, axis, to);
}

export function resizeColumn(table: TableElement, at: number, width: number): TableElement {
  if (at < 0 || at >= tableColCount(table)) return table;
  return {
    ...table,
    colWidths: table.colWidths.map((current, index) =>
      index === at ? Math.round(clamp(width, TABLE_MIN_COL_WIDTH, TABLE_MAX_COL_WIDTH)) : current,
    ),
  };
}

export function resizeRow(table: TableElement, at: number, height: number): TableElement {
  if (at < 0 || at >= tableRowCount(table)) return table;
  return {
    ...table,
    rowHeights: table.rowHeights.map((current, index) =>
      index === at
        ? Math.round(clamp(height, TABLE_MIN_ROW_HEIGHT, TABLE_MAX_ROW_HEIGHT))
        : current,
    ),
  };
}

/**
 * A table's outermost column or row pulled from the table's own edge.
 *
 * Pulling the right edge of a table widens its last column, not every column:
 * the columns inside were sized for what they hold, and the edge is where the
 * table meets what is beside it. The left and top edges take the first column
 * and row, and the table's origin moves with them so the far edge stays put.
 * `start` is the table as it was at the press; `delta` is the pull along the
 * edge's own axis, in scene units (positive is right or down).
 */
export function resizeOuterTrack(
  start: TableElement,
  side: 'n' | 'e' | 's' | 'w',
  delta: number,
): TableElement {
  switch (side) {
    case 'e': {
      const last = tableColCount(start) - 1;
      return resizeColumn(start, last, (start.colWidths[last] ?? 0) + delta);
    }
    case 's': {
      const last = tableRowCount(start) - 1;
      return resizeRow(start, last, (start.rowHeights[last] ?? 0) + delta);
    }
    case 'w': {
      const first = start.colWidths[0] ?? 0;
      const next = resizeColumn(start, 0, first - delta);
      return { ...next, x: start.x + first - (next.colWidths[0] ?? first) };
    }
    case 'n': {
      const first = start.rowHeights[0] ?? 0;
      const next = resizeRow(start, 0, first - delta);
      return { ...next, y: start.y + first - (next.rowHeights[0] ?? first) };
    }
  }
}

/**
 * Rows fitted to the text in them.
 *
 * `exact` is what a row becomes when a cell in it is typed into: as tall as its
 * tallest cell needs, never below the height an empty table is drawn at, so a
 * row that stretched for a long value comes back down when it is shortened.
 * `grow` only ever adds height, for everything that can squeeze text without
 * anyone typing — a narrower column, a larger size, a smaller table. It never
 * takes height away, so a row someone opened up by hand stays open.
 */
export function fitRowsToContent(
  table: TableElement,
  rows: readonly number[] | null,
  mode: 'grow' | 'exact',
): TableElement {
  const which = rows ?? table.rowHeights.map((_, index) => index);
  let changed = false;
  const rowHeights = [...table.rowHeights];
  for (const row of which) {
    const current = rowHeights[row];
    if (current === undefined) continue;
    const needed = tableAutoRowHeight(table, row);
    const next =
      mode === 'exact' ? Math.max(TABLE_DEFAULT_ROW_HEIGHT, needed) : Math.max(current, needed);
    if (next !== current) {
      rowHeights[row] = next;
      changed = true;
    }
  }
  // A merged cell down several rows needs the rows it spans, together, to be
  // tall enough; whatever they are short by goes onto its last row, as it does
  // in a spreadsheet.
  for (const merge of table.merges ?? []) {
    if (merge.rowSpan <= 1) continue;
    const last = merge.row + merge.rowSpan - 1;
    if (!which.some((row) => row >= merge.row && row <= last)) continue;
    const spanned = rowHeights.slice(merge.row, last + 1).reduce((sum, height) => sum + height, 0);
    const needed = tableMergeNeededHeight({ ...table, rowHeights }, merge);
    if (spanned >= needed) continue;
    rowHeights[last] = Math.min(TABLE_MAX_ROW_HEIGHT, (rowHeights[last] ?? 0) + needed - spanned);
    changed = true;
  }
  return changed ? { ...table, rowHeights } : table;
}

// --- Finding things on the grid -------------------------------------------

/**
 * Which track a coordinate falls in, given running edges like the ones from
 * `tableColumnOffsets` / `tableRowOffsets` — in scene units or any other, as
 * long as the coordinate is in the same. -1 outside the grid.
 */
export function trackIndexAt(edges: readonly number[], coord: number): number {
  const first = edges[0];
  const last = edges[edges.length - 1];
  if (first === undefined || last === undefined || coord < first || coord >= last) return -1;
  for (let index = 0; index < edges.length - 1; index += 1) {
    if (coord < edges[index + 1]!) return index;
  }
  return -1;
}

/** The cell under a scene point, or null when the point is off the table. */
export function cellAtPoint(
  table: TableElement,
  point: { x: number; y: number },
  clampToGrid = false,
): CellRef | null {
  const size = tableSize(table);
  let x = point.x - table.x;
  let y = point.y - table.y;
  if (clampToGrid) {
    // Dragged past the table's edge, a range keeps the outermost cell rather
    // than losing track of the pointer.
    x = clamp(x, 0, size.width - 0.001);
    y = clamp(y, 0, size.height - 0.001);
  }
  const row = trackIndexAt(tableRowOffsets(table), y);
  const col = trackIndexAt(tableColumnOffsets(table), x);
  return row === -1 || col === -1 ? null : resolveCell(table, { row, col });
}

/** The rows or columns a range covers, first and last. */
export function trackSpan(range: CellRange, axis: TableAxis): { start: number; end: number } {
  const [a, b] =
    axis === 'row' ? [range.anchor.row, range.focus.row] : [range.anchor.col, range.focus.col];
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/**
 * The range after a row or column was put in at `at`, still on the same cells.
 * Everything at or past the insertion point moves along by one.
 */
export function shiftRangeForInsert(range: CellRange, axis: TableAxis, at: number): CellRange {
  const shift = (ref: CellRef): CellRef =>
    axis === 'row'
      ? { row: ref.row >= at ? ref.row + 1 : ref.row, col: ref.col }
      : { row: ref.row, col: ref.col >= at ? ref.col + 1 : ref.col };
  return { ...range, anchor: shift(range.anchor), focus: shift(range.focus) };
}

/**
 * The range after tracks `start`..`end` were taken out: whatever was on them
 * lands on the track that took their place, inside whatever the table now is.
 */
export function rangeAfterDelete(
  table: Pick<TableElement, 'colWidths' | 'rowHeights'>,
  range: CellRange,
  axis: TableAxis,
  start: number,
  end: number,
): CellRange {
  const count = end - start + 1;
  const shift = (ref: CellRef): CellRef => {
    const along = axis === 'row' ? ref.row : ref.col;
    const moved = along > end ? along - count : along >= start ? start : along;
    return clampCellRef(table, axis === 'row' ? { ...ref, row: moved } : { ...ref, col: moved });
  };
  return { ...range, anchor: shift(range.anchor), focus: shift(range.focus) };
}

/**
 * Tracks `start`..`end` taken out, or null when that would leave none: a table
 * without a row or a column is not a table, and deleting the whole element is a
 * separate, deliberate act.
 */
export function deleteTracks(
  table: TableElement,
  axis: TableAxis,
  start: number,
  end: number,
): TableElement | null {
  const total = axis === 'row' ? tableRowCount(table) : tableColCount(table);
  const first = clamp(Math.min(start, end), 0, total - 1);
  const last = clamp(Math.max(start, end), 0, total - 1);
  if (last - first + 1 >= total) return null;
  let next = table;
  for (let index = last; index >= first; index -= 1) {
    next = axis === 'row' ? deleteRow(next, index) : deleteColumn(next, index);
  }
  return next;
}

// --- Whole rows and columns ------------------------------------------------

/** Rows or columns `start`..`end`, whole, as a range. */
export function wholeTracksRange(
  table: Pick<TableElement, 'colWidths' | 'rowHeights'>,
  axis: TableAxis,
  start: number,
  end: number,
): CellRange {
  const lastRow = tableRowCount(table) - 1;
  const lastCol = tableColCount(table) - 1;
  return axis === 'row'
    ? { anchor: { row: start, col: 0 }, focus: { row: end, col: lastCol }, whole: 'row' }
    : { anchor: { row: 0, col: start }, focus: { row: lastRow, col: end }, whole: 'col' };
}

/** The whole rows or columns a range holds, or null for an ordinary block. */
export function wholeTracks(
  range: CellRange | null,
): { axis: TableAxis; start: number; end: number } | null {
  if (!range?.whole) return null;
  return { axis: range.whole, ...trackSpan(range, range.whole) };
}

/**
 * The order the tracks end up in when `start`..`end` are carried to boundary
 * `to` (0 is before the first track, `count` after the last), as old indices.
 * A drop inside the block, or on either edge of it, leaves the order alone.
 */
export function reorderIndices(count: number, start: number, end: number, to: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  if (to >= start && to <= end + 1) return order;
  const block = order.slice(start, end + 1);
  const rest = order.filter((index) => index < start || index > end);
  const at = to > end ? to - block.length : to;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

/** Where the first of the carried tracks lands, by the same rule. */
export function movedTrackStart(start: number, end: number, to: number): number {
  if (to >= start && to <= end + 1) return start;
  return to > end ? to - (end - start + 1) : to;
}

/**
 * Rows or columns `start`..`end` carried to boundary `to`, with their cells and
 * their sizes. The same table back when the drop would change nothing, so a
 * drag that ends where it began leaves no undo step.
 */
export const moveTracks = withHeaderBaked(function moveTracks(
  table: TableElement,
  axis: TableAxis,
  start: number,
  end: number,
  to: number,
): TableElement {
  const rows = tableRowCount(table);
  const cols = tableColCount(table);
  if (!canMoveTracks(table, axis, start, end, to)) return table;
  const order = reorderIndices(axis === 'row' ? rows : cols, start, end, to);
  if (order.every((index, position) => index === position)) return table;
  // Where each old track ends up. A merge moves with its tracks, which stay
  // together: it is either inside the carried block or clear of it.
  const placeOf = new Map(order.map((old, position) => [old, position]));
  const merges = (table.merges ?? []).map((merge) => {
    const span = mergeSpan(merge, axis);
    const at = placeOf.get(span.start) ?? span.start;
    return withSpan(merge, axis, at, at + span.end - span.start);
  });

  const cells: TableCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const from =
        axis === 'row'
          ? tableCellAt(table, order[row]!, col)
          : tableCellAt(table, row, order[col]!);
      cells.push(from ?? {});
    }
  }
  return withMerges(
    axis === 'row'
      ? { ...table, rowHeights: order.map((index) => table.rowHeights[index]!), cells }
      : { ...table, colWidths: order.map((index) => table.colWidths[index]!), cells },
    merges,
  );
});

/**
 * Rows or columns `start`..`end` on their own, as a table of their own: what
 * is drawn lifted off the grid while they are carried.
 */
export function tracksAsTable(
  table: TableElement,
  axis: TableAxis,
  start: number,
  end: number,
): TableElement {
  const cols = tableColCount(table);
  // Merged cells inside the block come along, drawn as they are in the table.
  const merges = (table.merges ?? []).flatMap((merge) => {
    const span = mergeSpan(merge, axis);
    if (span.start < start || span.end > end) return [];
    return [withSpan(merge, axis, span.start - start, span.end - start)];
  });
  if (axis === 'row') {
    return withMerges(
      {
        ...table,
        rowHeights: table.rowHeights.slice(start, end + 1),
        cells: table.cells.slice(start * cols, (end + 1) * cols),
      },
      merges,
    );
  }
  const cells: TableCell[] = [];
  for (let row = 0; row < tableRowCount(table); row += 1) {
    cells.push(...table.cells.slice(row * cols + start, row * cols + end + 1));
  }
  return withMerges({ ...table, colWidths: table.colWidths.slice(start, end + 1), cells }, merges);
}

/**
 * Rows or columns `start`..`end` copied, with their contents and sizes, and put
 * in straight after the originals. The same table back when the copies would
 * take it past the limit: a partial duplicate would copy something other than
 * what was asked for.
 */
export const duplicateTracks = withHeaderBaked(function duplicateTracks(
  table: TableElement,
  axis: TableAxis,
  start: number,
  end: number,
): TableElement {
  const rows = tableRowCount(table);
  const cols = tableColCount(table);
  const count = end - start + 1;
  if (axis === 'row' ? rows + count > TABLE_MAX_ROWS : cols + count > TABLE_MAX_COLS) {
    return table;
  }
  // Half a merged cell cannot be copied.
  if (blockCutsMerge(table, axis, start, end)) return table;
  const merges = (table.merges ?? []).flatMap((merge) => {
    const span = mergeSpan(merge, axis);
    if (span.end < start) return [merge];
    if (span.start > end) return [withSpan(merge, axis, span.start + count, span.end + count)];
    return [merge, withSpan(merge, axis, span.start + count, span.end + count)];
  });
  // Old indices in their new order: everything up to the block, the block
  // again, then the rest.
  const order = [
    ...Array.from({ length: end + 1 }, (_, index) => index),
    ...Array.from({ length: count }, (_, index) => start + index),
    ...Array.from(
      { length: (axis === 'row' ? rows : cols) - end - 1 },
      (_, index) => end + 1 + index,
    ),
  ];
  const outRows = axis === 'row' ? order.length : rows;
  const outCols = axis === 'col' ? order.length : cols;
  const cells: TableCell[] = [];
  for (let row = 0; row < outRows; row += 1) {
    for (let col = 0; col < outCols; col += 1) {
      const from =
        axis === 'row'
          ? tableCellAt(table, order[row]!, col)
          : tableCellAt(table, row, order[col]!);
      cells.push({ ...(from ?? {}) });
    }
  }
  return withMerges(
    axis === 'row'
      ? { ...table, rowHeights: order.map((index) => table.rowHeights[index]!), cells }
      : { ...table, colWidths: order.map((index) => table.colWidths[index]!), cells },
    merges,
  );
});

// --- Fitting a column to its text ------------------------------------------

/**
 * A column made as narrow as it can be with none of its text wrapping — the
 * double-click on its edge every spreadsheet has.
 *
 * Found with the same wrapping the renderer uses, rather than an estimate of
 * its own, so the width it settles on is exactly the one where each line the
 * author typed stays on one line. Rounded up to the grid, and held to the
 * column limits: past the widest a column may be, the text still wraps. A
 * column with nothing in it is left as it is.
 */
export function fitColumnWidth(table: TableElement, col: number): TableElement {
  if (col < 0 || col >= tableColCount(table)) return table;
  const texts: { text: string; fontSize: number }[] = [];
  for (let row = 0; row < tableRowCount(table); row += 1) {
    // A merged cell across several columns is not this column's to fit.
    const area = tableCellArea(table, row, col);
    if (area.row !== row || area.col !== col || area.colSpan > 1) continue;
    const cell = tableCellAt(table, row, col);
    const text = cell?.text?.trim();
    if (text) texts.push({ text, fontSize: tableCellFontSize(table, cell) });
  }
  if (texts.length === 0) return table;

  const fits = (width: number) =>
    texts.every(
      ({ text, fontSize }) =>
        wrapDiagramLabel(text, width - TABLE_CELL_PADDING, fontSize, Number.MAX_SAFE_INTEGER)
          .length <= text.split('\n').length,
    );
  let low = TABLE_MIN_COL_WIDTH;
  let high = TABLE_MAX_COL_WIDTH;
  if (!fits(high)) low = high;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) high = middle;
    else low = middle + 1;
  }
  const width = Math.min(TABLE_MAX_COL_WIDTH, Math.ceil(low / 8) * 8);
  return fitRowsToContent(resizeColumn(table, col, width), null, 'exact');
}

/** A row brought to exactly the height its text needs. */
export function fitRowHeight(table: TableElement, row: number): TableElement {
  return fitRowsToContent(table, [row], 'exact');
}

// --- Pasting from a spreadsheet ----------------------------------------------

/**
 * Text copied out of a spreadsheet, as rows of cells.
 *
 * Spreadsheets put a tab between cells and a newline between rows, and quote a
 * cell that holds a tab, a newline or a quote of its own, doubling the quotes
 * inside it. The trailing newline most of them add is not an empty last row.
 */
export function parseTabularText(text: string): string[][] {
  const source = text.replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let atFieldStart = true;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
      continue;
    }
    if (char === '\t') {
      row.push(field);
      field = '';
      atFieldStart = true;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      atFieldStart = true;
      continue;
    }
    field += char;
    atFieldStart = false;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * A block of text laid into the table from cell `at`, growing the table to
 * hold it — as far as the limits allow. `truncated` says whether anything had
 * to be left out. The range is the block that was filled, to select after.
 */
export function pasteGrid(
  table: TableElement,
  at: CellRef,
  grid: readonly (readonly string[])[],
): { table: TableElement; range: CellRange; truncated: boolean } {
  const height = grid.length;
  const width = Math.max(0, ...grid.map((row) => row.length));
  let next = table;
  let truncated = false;

  const wantRows = at.row + height;
  const wantCols = at.col + width;
  while (tableRowCount(next) < Math.min(wantRows, TABLE_MAX_ROWS)) {
    next = insertRow(next, tableRowCount(next));
  }
  while (tableColCount(next) < Math.min(wantCols, TABLE_MAX_COLS)) {
    next = insertColumn(next, tableColCount(next));
  }
  if (wantRows > TABLE_MAX_ROWS || wantCols > TABLE_MAX_COLS) truncated = true;

  const lastRow = Math.min(wantRows, tableRowCount(next)) - 1;
  const lastCol = Math.min(wantCols, tableColCount(next)) - 1;
  // A block of values is a cell each: merged cells it lands on are split.
  next = unmergeCells(next, { anchor: at, focus: { row: lastRow, col: lastCol } });
  for (let row = at.row; row <= lastRow; row += 1) {
    for (let col = at.col; col <= lastCol; col += 1) {
      const value = grid[row - at.row]?.[col - at.col] ?? '';
      if (value.length > TABLE_CELL_TEXT_LIMIT) truncated = true;
      next = setCell(next, row, col, { text: value.slice(0, TABLE_CELL_TEXT_LIMIT) });
    }
  }

  const rows = Array.from({ length: lastRow - at.row + 1 }, (_, index) => at.row + index);
  return {
    table: fitRowsToContent(next, rows, 'grow'),
    range: { anchor: at, focus: { row: lastRow, col: lastCol } },
    truncated,
  };
}

/** The cells of a range as spreadsheet text: tabs between cells, newlines between rows. */
export function rangeAsTabularText(table: TableElement, range: CellRange): string {
  const rows = trackSpan(range, 'row');
  const cols = trackSpan(range, 'col');
  const quote = (text: string) => (/[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
  const lines: string[] = [];
  for (let row = rows.start; row <= rows.end; row += 1) {
    const fields: string[] = [];
    for (let col = cols.start; col <= cols.end; col += 1) {
      const covered = tableCellIsCovered(table, row, col);
      fields.push(covered ? '' : quote(tableCellAt(table, row, col)?.text ?? ''));
    }
    lines.push(fields.join('\t'));
  }
  return lines.join('\n');
}

/**
 * The inside lines of the grid as one path, in the table's own units.
 *
 * Drawn once rather than as a border round every cell: two cells stroking the
 * edge they share drew it twice, which read heavier than the outline and put a
 * darker dot on every corner where four cells met.
 */
export function tableGridPath(
  table: Pick<TableElement, 'colWidths' | 'rowHeights' | 'merges'>,
): string {
  const colOffsets = tableColumnOffsets(table);
  const rowOffsets = tableRowOffsets(table);
  const merges = table.merges ?? [];
  const parts: string[] = [];
  // Each inside line is drawn in the runs between the merged cells it would
  // otherwise cut through; with nothing merged, each is one run end to end.
  const across = (at: number, along: number, axis: TableAxis) =>
    merges.some((merge) => {
      const line = mergeSpan(merge, axis === 'col' ? 'col' : 'row');
      const other = mergeSpan(merge, axis === 'col' ? 'row' : 'col');
      return line.start < at && at <= line.end && along >= other.start && along <= other.end;
    });
  const runs = (count: number, hidden: (index: number) => boolean) => {
    const found: [number, number][] = [];
    let from: number | null = null;
    for (let index = 0; index <= count; index += 1) {
      if (index < count && !hidden(index)) from ??= index;
      else if (from !== null) {
        found.push([from, index]);
        from = null;
      }
    }
    return found;
  };
  colOffsets.slice(1, -1).forEach((x, index) => {
    for (const [from, to] of runs(rowOffsets.length - 1, (row) => across(index + 1, row, 'col'))) {
      parts.push(`M${x} ${rowOffsets[from]}V${rowOffsets[to]}`);
    }
  });
  rowOffsets.slice(1, -1).forEach((y, index) => {
    for (const [from, to] of runs(colOffsets.length - 1, (col) => across(index + 1, col, 'row'))) {
      parts.push(`M${colOffsets[from]} ${y}H${colOffsets[to]}`);
    }
  });
  return parts.join('');
}

/** Shift the whole table. Cells are laid out from x/y, so only the origin moves. */
export function moveTableBy(table: TableElement, dx: number, dy: number): TableElement {
  return { ...table, x: Math.round(table.x + dx), y: Math.round(table.y + dy) };
}

/** Every cell of the grid, for styling a whole table at once. */
export function wholeTableRange(table: Pick<TableElement, 'colWidths' | 'rowHeights'>): CellRange {
  return {
    anchor: { row: 0, col: 0 },
    focus: { row: tableRowCount(table) - 1, col: tableColCount(table) - 1 },
  };
}

/** Keep a selection inside a grid that just lost a row or column. */
export function clampCellRef(
  table: Pick<TableElement, 'colWidths' | 'rowHeights'>,
  ref: CellRef,
): CellRef {
  return {
    row: clamp(ref.row, 0, tableRowCount(table) - 1),
    col: clamp(ref.col, 0, tableColCount(table) - 1),
  };
}

// --- Scaling the whole table ------------------------------------------------

/**
 * How far a table can be scaled along each axis before one of its tracks hits
 * a limit.
 *
 * Every column scales by the same factor, so the narrowest column sets how far
 * the table can shrink and the widest how far it can grow. Stopping there keeps
 * the proportions the columns were given, rather than flattening them all onto
 * the minimum one by one.
 */
export function tableScaleLimits(table: TableElement): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const range = (tracks: readonly number[], min: number, max: number) => ({
    low: Math.max(...tracks.map((track) => min / track)),
    high: Math.min(...tracks.map((track) => max / track)),
  });
  const x = range(table.colWidths, TABLE_MIN_COL_WIDTH, TABLE_MAX_COL_WIDTH);
  const y = range(table.rowHeights, TABLE_MIN_ROW_HEIGHT, TABLE_MAX_ROW_HEIGHT);
  return { minX: x.low, maxX: x.high, minY: y.low, maxY: y.high };
}

/**
 * Every column widened by `scaleX` and every row by `scaleY`, as a table's
 * outer edge is pulled. Held to the limits above; the text keeps its size and
 * simply has more or less room, as it does when one column is dragged.
 */
export function scaleTable(table: TableElement, scaleX: number, scaleY: number): TableElement {
  const limits = tableScaleLimits(table);
  const sx = Math.min(limits.maxX, Math.max(limits.minX, scaleX));
  const sy = Math.min(limits.maxY, Math.max(limits.minY, scaleY));
  return {
    ...table,
    colWidths: table.colWidths.map((width) =>
      Math.round(clamp(width * sx, TABLE_MIN_COL_WIDTH, TABLE_MAX_COL_WIDTH)),
    ),
    rowHeights: table.rowHeights.map((height) =>
      Math.round(clamp(height * sy, TABLE_MIN_ROW_HEIGHT, TABLE_MAX_ROW_HEIGHT)),
    ),
  };
}

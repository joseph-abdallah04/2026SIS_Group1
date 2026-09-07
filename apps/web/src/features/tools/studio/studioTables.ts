// Table behaviour, as pure functions over a `TableElement`.
//
// Everything a spreadsheet does that is easy to get subtly wrong — where Tab
// goes from the last cell, what happens to widths when a column is removed,
// whether a range is still valid after a row goes — lives here so it can be
// tested without a canvas. The editor supplies the pointer and keyboard events
// and nothing else.

import {
  TABLE_DEFAULT_COL_WIDTH,
  TABLE_DEFAULT_ROW_HEIGHT,
  TABLE_MAX_COLS,
  TABLE_MAX_COL_WIDTH,
  TABLE_MAX_ROWS,
  TABLE_MAX_ROW_HEIGHT,
  TABLE_MIN_COL_WIDTH,
  TABLE_MIN_ROW_HEIGHT,
  tableCellIndex,
  tableColCount,
  tableRowCount,
  type DiagramFillKey,
  type TableCell,
  type TableCellAlign,
  type TableElement,
} from '@roundtable/shared';

export interface CellRef {
  row: number;
  col: number;
}

/** A rectangular block of cells, as the two corners the user picked. */
export interface CellRange {
  anchor: CellRef;
  focus: CellRef;
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
    colWidths: Array.from({ length: safeCols }, () => TABLE_DEFAULT_COL_WIDTH),
    rowHeights: Array.from({ length: safeRows }, () => TABLE_DEFAULT_ROW_HEIGHT),
    cells: Array.from({ length: safeRows * safeCols }, () => ({})),
    // A grid almost always has headings, and turning it off is one click.
    headerRow: true,
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
  table: Pick<TableElement, 'colWidths' | 'rowHeights'>,
  from: CellRef,
  key: TableNavKey,
  shift = false,
): CellRef {
  const rows = tableRowCount(table);
  const cols = tableColCount(table);
  const row = clamp(from.row, 0, rows - 1);
  const col = clamp(from.col, 0, cols - 1);

  switch (key) {
    case 'ArrowUp':
      return { row: Math.max(0, row - 1), col };
    case 'ArrowDown':
      return { row: Math.min(rows - 1, row + 1), col };
    case 'ArrowLeft':
      return { row, col: Math.max(0, col - 1) };
    case 'ArrowRight':
      return { row, col: Math.min(cols - 1, col + 1) };
    case 'Tab': {
      const flat = row * cols + col + (shift ? -1 : 1);
      const wrapped = (flat + rows * cols) % (rows * cols);
      return { row: Math.floor(wrapped / cols), col: wrapped % cols };
    }
    case 'Enter': {
      const next = row + (shift ? -1 : 1);
      const wrapped = (next + rows) % rows;
      return { row: wrapped, col };
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
  for (const { row, col } of cellsInRange(range)) {
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
  for (const { row, col } of cellsInRange(range)) {
    const index = tableCellIndex(table, row, col);
    if (index === -1) continue;
    next[index] = { ...next[index], align };
  }
  return withCells(table, next);
}

export function clearCellRange(table: TableElement, range: CellRange): TableElement {
  const next = [...table.cells];
  for (const { row, col } of cellsInRange(range)) {
    const index = tableCellIndex(table, row, col);
    if (index === -1) continue;
    const cell = { ...next[index] };
    delete cell.text;
    next[index] = cell;
  }
  return withCells(table, next);
}

// --- Structure ------------------------------------------------------------

export function insertRow(table: TableElement, at: number): TableElement {
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
  return { ...table, rowHeights, cells };
}

export function deleteRow(table: TableElement, at: number): TableElement {
  const rows = tableRowCount(table);
  const cols = tableColCount(table);
  // A table with no rows is not a table; the caller deletes the element.
  if (rows <= 1 || at < 0 || at >= rows) return table;

  const rowHeights = table.rowHeights.filter((_, index) => index !== at);
  const cells = [...table.cells];
  cells.splice(at * cols, cols);
  return { ...table, rowHeights, cells };
}

export function insertColumn(table: TableElement, at: number): TableElement {
  const rows = tableRowCount(table);
  const cols = tableColCount(table);
  if (cols >= TABLE_MAX_COLS) return table;
  const index = clamp(at, 0, cols);

  const colWidths = [...table.colWidths];
  colWidths.splice(index, 0, table.colWidths[Math.min(index, cols - 1)] ?? TABLE_DEFAULT_COL_WIDTH);

  const cells: TableCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    const start = row * cols;
    cells.push(
      ...table.cells.slice(start, start + index),
      {},
      ...table.cells.slice(start + index, start + cols),
    );
  }
  return { ...table, colWidths, cells };
}

export function deleteColumn(table: TableElement, at: number): TableElement {
  const rows = tableRowCount(table);
  const cols = tableColCount(table);
  if (cols <= 1 || at < 0 || at >= cols) return table;

  const colWidths = table.colWidths.filter((_, index) => index !== at);
  const cells: TableCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    const start = row * cols;
    for (let col = 0; col < cols; col += 1) {
      if (col !== at) cells.push(table.cells[start + col] ?? {});
    }
  }
  return { ...table, colWidths, cells };
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

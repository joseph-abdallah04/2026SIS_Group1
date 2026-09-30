import { describe, expect, it } from 'vitest';
import {
  DIAGRAM_CANVAS_WIDTH,
  TABLE_MAX_COLS,
  TABLE_MAX_ROWS,
  TABLE_MIN_COL_WIDTH,
  tableAutoRowHeight,
  tableCellAt,
  tableCellBold,
  tableCellColor,
  tableCellFill,
  tableCellLines,
  tableColumnOffsets,
  tableRowOffsets,
  tableSize,
} from '@roundtable/shared';
import { diagramWriteArtifactSchema } from '@roundtable/shared/schemas';

import {
  TABLE_NEW_COL_WIDTH,
  alignCellRange,
  bakeHeaderRow,
  blockCutsMerge,
  canMoveTracks,
  expandRangeToMerges,
  mergeAction,
  mergeCells,
  resolveCell,
  unmergeCells,
  cellAtPoint,
  cellsInRange,
  clampCellRef,
  clearCellRange,
  createTable,
  deleteColumn,
  deleteRow,
  deleteTracks,
  duplicateTracks,
  fillCellRange,
  fitColumnWidth,
  fitRowsToContent,
  insertColumn,
  insertRow,
  isCellInRange,
  moveTableBy,
  moveTableSelection,
  moveTracks,
  movedTrackStart,
  newTableColWidth,
  parseTabularText,
  pasteGrid,
  rangeAfterDelete,
  rangeAsTabularText,
  reorderIndices,
  resizeColumn,
  resizeOuterTrack,
  resizeRow,
  setCell,
  shiftRangeForInsert,
  styleCellRange,
  tableGridPath,
  tracksAsTable,
  trackIndexAt,
  trackSpan,
  wholeTableRange,
  wholeTracks,
  wholeTracksRange,
} from './studioTables';

const grid = (rows = 3, cols = 3) => createTable(rows, cols, { x: 0, y: 0 });

/** Fills each cell with "r,c" so moves and structure edits are traceable. */
function labelled(rows = 3, cols = 3) {
  let table = grid(rows, cols);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1)
      table = setCell(table, row, col, { text: `${row},${col}` });
  }
  return table;
}

describe('creating a table', () => {
  it('builds exactly one cell per column per row', () => {
    const table = grid(3, 4);
    expect(table.rowHeights).toHaveLength(3);
    expect(table.colWidths).toHaveLength(4);
    expect(table.cells).toHaveLength(12);
  });

  it('clamps a request beyond the bounds instead of refusing it', () => {
    const table = createTable(500, 500, { x: 0, y: 0 });
    expect(table.rowHeights).toHaveLength(TABLE_MAX_ROWS);
    expect(table.colWidths).toHaveLength(TABLE_MAX_COLS);
    expect(createTable(0, 0, { x: 0, y: 0 }).cells).toHaveLength(1);
  });

  it('starts at Medium, with columns wide enough to hold it', () => {
    const table = grid(2, 3);
    expect(table.fontSizePreset).toBe('medium');
    expect(table.colWidths).toEqual([
      TABLE_NEW_COL_WIDTH,
      TABLE_NEW_COL_WIDTH,
      TABLE_NEW_COL_WIDTH,
    ]);
  });

  it('narrows the columns of a wide new table so it still fits on the sheet', () => {
    for (let cols = 1; cols <= TABLE_MAX_COLS; cols += 1) {
      const width = newTableColWidth(cols);
      expect(width * cols).toBeLessThan(DIAGRAM_CANVAS_WIDTH);
      expect(width).toBeGreaterThanOrEqual(TABLE_MIN_COL_WIDTH);
      expect(width % 8).toBe(0);
    }
    expect(newTableColWidth(8)).toBeLessThan(TABLE_NEW_COL_WIDTH);
  });

  it('produces something the real write contract accepts', () => {
    expect(
      diagramWriteArtifactSchema.safeParse({
        type: 'diagram',
        nodes: [],
        edges: [],
        tables: [grid(3, 3)],
      }).success,
    ).toBe(true);
  });
});

describe('moving between cells', () => {
  const table = grid(3, 3);

  it('stops at the edges rather than wrapping on the arrows', () => {
    expect(moveTableSelection(table, { row: 0, col: 0 }, 'ArrowUp')).toEqual({ row: 0, col: 0 });
    expect(moveTableSelection(table, { row: 0, col: 0 }, 'ArrowLeft')).toEqual({ row: 0, col: 0 });
    expect(moveTableSelection(table, { row: 2, col: 2 }, 'ArrowDown')).toEqual({ row: 2, col: 2 });
    expect(moveTableSelection(table, { row: 2, col: 2 }, 'ArrowRight')).toEqual({ row: 2, col: 2 });
  });

  it('steps one cell at a time in each direction', () => {
    expect(moveTableSelection(table, { row: 1, col: 1 }, 'ArrowUp')).toEqual({ row: 0, col: 1 });
    expect(moveTableSelection(table, { row: 1, col: 1 }, 'ArrowDown')).toEqual({ row: 2, col: 1 });
    expect(moveTableSelection(table, { row: 1, col: 1 }, 'ArrowLeft')).toEqual({ row: 1, col: 0 });
    expect(moveTableSelection(table, { row: 1, col: 1 }, 'ArrowRight')).toEqual({ row: 1, col: 2 });
  });

  it('carries Tab on to the next row at the end of one', () => {
    expect(moveTableSelection(table, { row: 0, col: 2 }, 'Tab')).toEqual({ row: 1, col: 0 });
  });

  it('wraps Tab round from the last cell to the first', () => {
    expect(moveTableSelection(table, { row: 2, col: 2 }, 'Tab')).toEqual({ row: 0, col: 0 });
  });

  it('reverses Tab with shift, back round the other way', () => {
    expect(moveTableSelection(table, { row: 1, col: 0 }, 'Tab', true)).toEqual({ row: 0, col: 2 });
    expect(moveTableSelection(table, { row: 0, col: 0 }, 'Tab', true)).toEqual({ row: 2, col: 2 });
  });

  it('moves Enter down the column and wraps to the top', () => {
    expect(moveTableSelection(table, { row: 0, col: 1 }, 'Enter')).toEqual({ row: 1, col: 1 });
    expect(moveTableSelection(table, { row: 2, col: 1 }, 'Enter')).toEqual({ row: 0, col: 1 });
    expect(moveTableSelection(table, { row: 0, col: 1 }, 'Enter', true)).toEqual({
      row: 2,
      col: 1,
    });
  });

  it('recovers from a selection left outside the grid', () => {
    expect(moveTableSelection(table, { row: 9, col: 9 }, 'ArrowLeft')).toEqual({ row: 2, col: 1 });
  });
});

describe('ranges', () => {
  it('covers every cell between the two corners, whichever way round they are', () => {
    const range = { anchor: { row: 2, col: 2 }, focus: { row: 1, col: 1 } };
    expect(cellsInRange(range)).toEqual([
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ]);
    expect(isCellInRange(range, 1, 2)).toBe(true);
    expect(isCellInRange(range, 0, 0)).toBe(false);
  });

  it('fills a whole block at once, and clears it again', () => {
    const range = { anchor: { row: 0, col: 0 }, focus: { row: 1, col: 1 } };
    const filled = fillCellRange(grid(3, 3), range, 'blue');
    expect(tableCellAt(filled, 0, 0)?.fill).toBe('blue');
    expect(tableCellAt(filled, 1, 1)?.fill).toBe('blue');
    expect(tableCellAt(filled, 2, 2)?.fill).toBeUndefined();

    const cleared = fillCellRange(filled, range, null);
    expect(tableCellAt(cleared, 0, 0)?.fill).toBeUndefined();
  });

  it('aligns and clears text across a block', () => {
    const range = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 2 } };
    const aligned = alignCellRange(labelled(), range, 'center');
    expect(tableCellAt(aligned, 0, 1)?.align).toBe('center');

    const cleared = clearCellRange(aligned, range);
    expect(tableCellAt(cleared, 0, 1)?.text).toBeUndefined();
    // Clearing text leaves the alignment the author chose.
    expect(tableCellAt(cleared, 0, 1)?.align).toBe('center');
    expect(tableCellAt(cleared, 1, 0)?.text).toBe('1,0');
  });
});

describe('editing a cell', () => {
  it('stores text and drops it again when it is blanked', () => {
    const typed = setCell(grid(), 1, 1, { text: 'Hello' });
    expect(tableCellAt(typed, 1, 1)?.text).toBe('Hello');
    expect(tableCellAt(setCell(typed, 1, 1, { text: '   ' }), 1, 1)?.text).toBeUndefined();
  });

  it('ignores a cell outside the grid', () => {
    const table = grid();
    expect(setCell(table, 9, 9, { text: 'nope' })).toBe(table);
  });
});

describe('rows and columns', () => {
  it('inserts a row of empty cells in the right place', () => {
    const table = insertRow(labelled(), 1);
    expect(table.rowHeights).toHaveLength(4);
    expect(tableCellAt(table, 0, 0)?.text).toBe('0,0');
    expect(tableCellAt(table, 1, 0)?.text).toBeUndefined();
    // What was row 1 has moved down, intact.
    expect(tableCellAt(table, 2, 0)?.text).toBe('1,0');
  });

  it('inserts a column without shearing the rows', () => {
    const table = insertColumn(labelled(), 1);
    expect(table.colWidths).toHaveLength(4);
    expect(table.cells).toHaveLength(12);
    expect(tableCellAt(table, 0, 0)?.text).toBe('0,0');
    expect(tableCellAt(table, 0, 1)?.text).toBeUndefined();
    expect(tableCellAt(table, 0, 2)?.text).toBe('0,1');
    expect(tableCellAt(table, 2, 3)?.text).toBe('2,2');
  });

  it('deletes a row and takes its cells with it', () => {
    const table = deleteRow(labelled(), 1);
    expect(table.rowHeights).toHaveLength(2);
    expect(tableCellAt(table, 1, 0)?.text).toBe('2,0');
  });

  it('deletes a column and takes its cells with it', () => {
    const table = deleteColumn(labelled(), 1);
    expect(table.colWidths).toHaveLength(2);
    expect(table.cells).toHaveLength(6);
    expect(tableCellAt(table, 0, 1)?.text).toBe('0,2');
    expect(tableCellAt(table, 2, 1)?.text).toBe('2,2');
  });

  it('refuses to remove the last row or column', () => {
    const single = grid(1, 1);
    expect(deleteRow(single, 0)).toBe(single);
    expect(deleteColumn(single, 0)).toBe(single);
  });

  it('refuses to grow past the bounds', () => {
    const wide = grid(1, TABLE_MAX_COLS);
    expect(insertColumn(wide, 0)).toBe(wide);
    const tall = grid(TABLE_MAX_ROWS, 1);
    expect(insertRow(tall, 0)).toBe(tall);
  });

  it('takes a block of rows or columns out at once', () => {
    const rows = deleteTracks(labelled(4, 2), 'row', 1, 2)!;
    expect(rows.rowHeights).toHaveLength(2);
    expect(tableCellAt(rows, 1, 0)?.text).toBe('3,0');
    const cols = deleteTracks(labelled(2, 4), 'col', 2, 1)!;
    expect(cols.colWidths).toHaveLength(2);
    expect(tableCellAt(cols, 0, 1)?.text).toBe('0,3');
  });

  it('refuses to take out every row or every column', () => {
    expect(deleteTracks(labelled(3, 3), 'row', 0, 2)).toBeNull();
    expect(deleteTracks(labelled(3, 3), 'col', 0, 5)).toBeNull();
  });

  it('keeps the grid well-formed for the write contract after every edit', () => {
    let table = labelled(3, 3);
    table = insertRow(table, 1);
    table = insertColumn(table, 2);
    table = deleteRow(table, 0);
    table = deleteColumn(table, 1);
    table = deleteTracks(table, 'row', 0, 0)!;
    expect(table.cells).toHaveLength(table.rowHeights.length * table.colWidths.length);
    expect(
      diagramWriteArtifactSchema.safeParse({
        type: 'diagram',
        nodes: [],
        edges: [],
        tables: [table],
      }).success,
    ).toBe(true);
  });
});

describe('resizing', () => {
  it('clamps a column to its bounds rather than letting it vanish', () => {
    expect(resizeColumn(grid(), 0, 5).colWidths[0]).toBe(TABLE_MIN_COL_WIDTH);
    expect(resizeColumn(grid(), 0, 9999).colWidths[0]).toBe(400);
    expect(resizeColumn(grid(), 0, 150).colWidths[0]).toBe(150);
  });

  it('clamps a row the same way', () => {
    expect(resizeRow(grid(), 0, 1).rowHeights[0]).toBe(24);
    expect(resizeRow(grid(), 0, 9999).rowHeights[0]).toBe(200);
  });

  it('leaves an index that is not there alone', () => {
    const table = grid();
    expect(resizeColumn(table, 9, 100)).toBe(table);
    expect(resizeRow(table, 9, 100)).toBe(table);
  });

  it('reports the size and the column offsets the renderer draws from', () => {
    const table = resizeColumn(grid(2, 2), 0, 120);
    expect(tableSize(table)).toEqual({ width: 248, height: 64 });
    expect(tableColumnOffsets(table)).toEqual([0, 120, 248]);
  });

  it('widens only the last column when the right edge is pulled', () => {
    const table = resizeOuterTrack(grid(2, 3), 'e', 40);
    expect(table.colWidths).toEqual([128, 128, 168]);
    expect(table.x).toBe(0);
  });

  it('holds the far edge still when the left or top edge is pulled', () => {
    const start = { ...grid(3, 3), x: 100, y: 100 };
    const wider = resizeOuterTrack(start, 'w', -40);
    expect(wider.colWidths).toEqual([168, 128, 128]);
    expect(wider.x + tableSize(wider).width).toBe(start.x + tableSize(start).width);

    const shorter = resizeOuterTrack(start, 'n', 20);
    expect(shorter.rowHeights[0]).toBe(24);
    // Clamped at the minimum, and the origin only moves as far as the row shrank.
    expect(shorter.y).toBe(108);
    expect(shorter.y + tableSize(shorter).height).toBe(start.y + tableSize(start).height);
  });
});

describe('fitting rows to their text', () => {
  const long = 'a much longer heading than fits on one line of a column';

  it('grows a row to what its text needs', () => {
    const table = setCell(grid(2, 2), 0, 0, { text: long });
    const fitted = fitRowsToContent(table, [0], 'exact');
    expect(fitted.rowHeights[0]).toBe(tableAutoRowHeight(table, 0));
    expect(fitted.rowHeights[0]).toBeGreaterThan(table.rowHeights[0]!);
  });

  it('brings a row back down on an exact fit, never below an empty row', () => {
    const tall = resizeRow(setCell(grid(2, 2), 0, 0, { text: 'short' }), 0, 120);
    expect(fitRowsToContent(tall, [0], 'exact').rowHeights[0]).toBe(32);
  });

  it('only ever adds height when growing, so a row opened by hand stays open', () => {
    const tall = resizeRow(grid(2, 2), 1, 120);
    expect(fitRowsToContent(tall, null, 'grow').rowHeights).toEqual([32, 120]);
  });

  it('hands back the same table when nothing needs to change', () => {
    const table = grid(2, 2);
    expect(fitRowsToContent(table, null, 'grow')).toBe(table);
  });
});

describe('finding things on the grid', () => {
  it('finds the track a coordinate falls in, and none outside', () => {
    const edges = [0, 100, 150, 300];
    expect(trackIndexAt(edges, 0)).toBe(0);
    expect(trackIndexAt(edges, 120)).toBe(1);
    expect(trackIndexAt(edges, 299)).toBe(2);
    expect(trackIndexAt(edges, 300)).toBe(-1);
    expect(trackIndexAt(edges, -1)).toBe(-1);
  });

  it('finds the cell under a point, and clamps one dragged off the table', () => {
    const table = { ...grid(3, 3), x: 100, y: 50 };
    expect(cellAtPoint(table, { x: 100 + 130, y: 50 + 40 })).toEqual({ row: 1, col: 1 });
    expect(cellAtPoint(table, { x: 0, y: 0 })).toBeNull();
    expect(cellAtPoint(table, { x: 9999, y: 0 }, true)).toEqual({ row: 0, col: 2 });
  });

  it('draws each inside line once, and none on the outline', () => {
    const table = grid(2, 3);
    expect(tableGridPath(table)).toBe('M128 0V64M256 0V64M0 32H384');
    expect(tableGridPath(grid(1, 1))).toBe('');
    expect(tableRowOffsets(table)).toEqual([0, 32, 64]);
  });
});

describe('presentation', () => {
  it('tints the first row of a new table with a fill of its own, not a flag', () => {
    const table = grid();
    expect(table.headerRow).toBeUndefined();
    expect(tableCellAt(table, 0, 1)?.fill).toBe('neutral');
    expect(tableCellAt(table, 1, 1)?.fill).toBeUndefined();
    expect(tableCellFill(table, tableCellAt(table, 0, 0), 0)).not.toBe(
      tableCellFill(table, tableCellAt(table, 1, 0), 1),
    );
  });

  it('still tints the first row of a table written with the old heading flag', () => {
    expect(tableCellFill({ headerRow: true }, null, 0)).not.toBe(tableCellFill({}, null, 1));
    expect(tableCellFill({ headerRow: false }, null, 0)).toBe(tableCellFill({}, null, 1));
  });

  it('lets a cell fill beat the header tint', () => {
    expect(tableCellFill(grid(), { fill: 'rose' }, 0)).toBe('#FAE0E0');
  });

  it('wraps cell text to its own column', () => {
    const table = fitRowsToContent(
      setCell(grid(2, 2), 0, 0, { text: 'a much longer heading than fits' }),
      [0],
      'exact',
    );
    expect(tableCellLines(table, tableCellAt(table, 0, 0), 0, 0).length).toBeGreaterThan(1);
    expect(tableCellLines(table, tableCellAt(table, 1, 1), 1, 1)).toEqual([]);
  });

  it('measures the height a row needs for its tallest wrapped cell', () => {
    const table = setCell(grid(2, 2), 0, 0, {
      text: 'a much longer heading than fits in one line',
    });
    expect(tableAutoRowHeight(table, 0)).toBeGreaterThan(tableAutoRowHeight(table, 1));
  });
});

describe('moving and styling a whole table', () => {
  it('shifts only the origin, since cells are laid out from it', () => {
    const moved = moveTableBy(grid(2, 2), 40, -15);
    expect(moved.x).toBe(40);
    expect(moved.y).toBe(-15);
    expect(moved.cells).toHaveLength(4);
  });

  it('covers every cell of the grid', () => {
    expect(cellsInRange(wholeTableRange(grid(2, 3)))).toHaveLength(6);
  });

  it('applies size, weight and colour across a block', () => {
    const range = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 1 } };
    const styled = styleCellRange(grid(2, 2), range, {
      bold: true,
      color: 'rose',
      fontSizePreset: 'large',
    });
    expect(tableCellAt(styled, 0, 1)).toMatchObject({
      bold: true,
      color: 'rose',
      fontSizePreset: 'large',
    });
    expect(tableCellAt(styled, 1, 0)?.bold).toBeUndefined();
  });

  it('drops weight and colour again rather than storing a falsy value', () => {
    const range = { anchor: { row: 1, col: 0 }, focus: { row: 1, col: 0 } };
    const styled = styleCellRange(grid(2, 2), range, { bold: true, color: 'rose' });
    const cleared = styleCellRange(styled, range, { bold: false, color: null });
    expect(tableCellAt(cleared, 1, 0)?.bold).toBeUndefined();
    expect(tableCellAt(cleared, 1, 0)?.color).toBeUndefined();
  });

  it('stores "not bold" on a heading cell, whose default is bold', () => {
    const range = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } };
    const plain = styleCellRange({ ...grid(2, 2), headerRow: true }, range, { bold: false });
    expect(tableCellAt(plain, 0, 0)?.bold).toBe(false);
    expect(tableCellBold(plain, tableCellAt(plain, 0, 0), 0)).toBe(false);
  });

  it('lets one large cell set the height its row needs', () => {
    const base = setCell(grid(2, 2), 0, 0, { text: 'a heading that has to wrap somewhere' });
    const larger = styleCellRange(
      base,
      { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } },
      { fontSizePreset: 'large' },
    );
    expect(tableAutoRowHeight(larger, 0)).toBeGreaterThan(tableAutoRowHeight(base, 0));
  });

  it('bolds a header cell by default and lets a cell override it', () => {
    expect(tableCellBold({ headerRow: true }, null, 0)).toBe(true);
    expect(tableCellBold({ headerRow: true }, null, 1)).toBe(false);
    expect(tableCellBold({ headerRow: true }, { bold: false }, 0)).toBe(false);
  });

  it('falls back to the label ink when a cell has no colour of its own', () => {
    expect(tableCellColor(null)).toBe('#080C15');
    expect(tableCellColor({ color: 'rose' })).toBe('#A03040');
  });
});

describe('keeping a selection valid', () => {
  it('keeps a selection on the same cells when a row goes in above it', () => {
    const range = { anchor: { row: 1, col: 0 }, focus: { row: 2, col: 1 } };
    expect(shiftRangeForInsert(range, 'row', 2)).toEqual({
      anchor: { row: 1, col: 0 },
      focus: { row: 3, col: 1 },
    });
    expect(shiftRangeForInsert(range, 'col', 0)).toEqual({
      anchor: { row: 1, col: 1 },
      focus: { row: 2, col: 2 },
    });
  });

  it('lands a selection on what took the place of deleted rows', () => {
    const after = deleteTracks(labelled(5, 2), 'row', 1, 2)!;
    const range = { anchor: { row: 1, col: 0 }, focus: { row: 4, col: 0 } };
    expect(rangeAfterDelete(after, range, 'row', 1, 2)).toEqual({
      anchor: { row: 1, col: 0 },
      focus: { row: 2, col: 0 },
    });
  });

  it('reads the rows or columns a range covers, whichever way it was dragged', () => {
    const range = { anchor: { row: 3, col: 0 }, focus: { row: 1, col: 2 } };
    expect(trackSpan(range, 'row')).toEqual({ start: 1, end: 3 });
    expect(trackSpan(range, 'col')).toEqual({ start: 0, end: 2 });
  });

  it('pulls a selection back inside a grid that just shrank', () => {
    expect(clampCellRef(grid(2, 2), { row: 5, col: 5 })).toEqual({ row: 1, col: 1 });
    expect(clampCellRef(grid(2, 2), { row: -3, col: 0 })).toEqual({ row: 0, col: 0 });
  });
});

describe('whole rows and columns', () => {
  it('picks a row whole, and says so', () => {
    const range = wholeTracksRange(grid(3, 4), 'row', 1, 2);
    expect(range).toEqual({
      anchor: { row: 1, col: 0 },
      focus: { row: 2, col: 3 },
      whole: 'row',
    });
    expect(wholeTracks(range)).toEqual({ axis: 'row', start: 1, end: 2 });
    // An ordinary block is not whole, even one that spans a row.
    expect(wholeTracks({ anchor: range.anchor, focus: range.focus })).toBeNull();
  });

  it('keeps a whole selection whole through an insert', () => {
    const range = wholeTracksRange(grid(3, 3), 'col', 1, 1);
    expect(shiftRangeForInsert(range, 'col', 0).whole).toBe('col');
  });

  it('works out the new order when a block is carried to a boundary', () => {
    expect(reorderIndices(5, 1, 2, 5)).toEqual([0, 3, 4, 1, 2]);
    expect(reorderIndices(5, 3, 3, 0)).toEqual([3, 0, 1, 2, 4]);
    // Onto its own edges or inside itself: nothing moves.
    expect(reorderIndices(5, 1, 2, 1)).toEqual([0, 1, 2, 3, 4]);
    expect(reorderIndices(5, 1, 2, 3)).toEqual([0, 1, 2, 3, 4]);
    expect(movedTrackStart(1, 2, 5)).toBe(3);
    expect(movedTrackStart(3, 3, 0)).toBe(0);
  });

  it('carries rows with their cells and their heights', () => {
    const table = resizeRow(labelled(3, 2), 0, 60);
    const moved = moveTracks(table, 'row', 0, 0, 3);
    expect(moved.rowHeights).toEqual([32, 32, 60]);
    expect(tableCellAt(moved, 2, 1)?.text).toBe('0,1');
    expect(tableCellAt(moved, 0, 0)?.text).toBe('1,0');
  });

  it('carries columns without shearing the rows', () => {
    const moved = moveTracks(labelled(2, 3), 'col', 2, 2, 0);
    expect(moved.cells.map((cell) => cell.text)).toEqual([
      '0,2',
      '0,0',
      '0,1',
      '1,2',
      '1,0',
      '1,1',
    ]);
  });

  it('hands back the same table for a drop that changes nothing', () => {
    const table = labelled(3, 3);
    expect(moveTracks(table, 'row', 1, 1, 2)).toBe(table);
  });

  it('copies rows in straight after themselves', () => {
    const copied = duplicateTracks(labelled(3, 2), 'row', 0, 1);
    expect(copied.rowHeights).toHaveLength(5);
    expect(copied.cells.map((cell) => cell.text)).toEqual([
      '0,0',
      '0,1',
      '1,0',
      '1,1',
      '0,0',
      '0,1',
      '1,0',
      '1,1',
      '2,0',
      '2,1',
    ]);
    // Copies, not shared cells: editing one leaves the other alone.
    expect(copied.cells[0]).not.toBe(copied.cells[4]);
  });

  it('refuses a duplicate that would go past the limit rather than copying part of it', () => {
    const wide = grid(1, TABLE_MAX_COLS - 1);
    expect(duplicateTracks(wide, 'col', 0, 1)).toBe(wide);
    expect(duplicateTracks(wide, 'col', 0, 0).colWidths).toHaveLength(TABLE_MAX_COLS);
  });
});

describe('fitting a column to its text', () => {
  it('widens a column until nothing in it wraps', () => {
    const table = setCell(grid(2, 2), 1, 0, { text: 'a heading long enough to wrap twice over' });
    const fitted = fitColumnWidth(table, 0);
    expect(fitted.colWidths[0]).toBeGreaterThan(128);
    expect(fitted.colWidths[0]! % 8).toBe(0);
    expect(tableCellLines(fitted, tableCellAt(fitted, 1, 0), 0, 1)).toHaveLength(1);
    expect(fitted.rowHeights[1]).toBe(32);
  });

  it('narrows a column to its longest line, and no further', () => {
    const table = setCell(grid(2, 2), 0, 1, { text: 'Owner' });
    const fitted = fitColumnWidth(table, 1);
    expect(fitted.colWidths[1]).toBeLessThan(128);
    expect(tableCellLines(fitted, tableCellAt(fitted, 0, 1), 1, 0)).toEqual(['Owner']);
  });

  it('keeps the lines the author broke', () => {
    const table = setCell(grid(1, 1), 0, 0, { text: 'first\nsecond' });
    const fitted = fitColumnWidth(table, 0);
    expect(tableCellLines(fitted, tableCellAt(fitted, 0, 0), 0, 0)).toEqual(['first', 'second']);
  });

  it('leaves an empty column as it is', () => {
    const table = grid(2, 2);
    expect(fitColumnWidth(table, 0)).toBe(table);
  });
});

describe('pasting from a spreadsheet', () => {
  it('reads tabs between cells and newlines between rows', () => {
    expect(parseTabularText('a\tb\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('ignores the trailing newline and reads Windows line ends', () => {
    expect(parseTabularText('a\tb\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps a quoted cell whole, with its own tabs, newlines and quotes', () => {
    expect(parseTabularText('"two\nlines"\t"a ""quoted"" word"\tplain')).toEqual([
      ['two\nlines', 'a "quoted" word', 'plain'],
    ]);
  });

  it('keeps empty cells in their place', () => {
    expect(parseTabularText('a\t\tc')).toEqual([['a', '', 'c']]);
  });

  it('fills the cells from where it is pasted, growing the table to hold it', () => {
    const { table, range, truncated } = pasteGrid(labelled(2, 2), { row: 1, col: 1 }, [
      ['x', 'y'],
      ['z', 'w'],
    ]);
    expect(table.rowHeights).toHaveLength(3);
    expect(table.colWidths).toHaveLength(3);
    expect(tableCellAt(table, 1, 1)?.text).toBe('x');
    expect(tableCellAt(table, 2, 2)?.text).toBe('w');
    expect(tableCellAt(table, 0, 0)?.text).toBe('0,0');
    expect(range).toEqual({ anchor: { row: 1, col: 1 }, focus: { row: 2, col: 2 } });
    expect(truncated).toBe(false);
  });

  it('stops at the size limits and the cell limit, and says it did', () => {
    const tall = Array.from({ length: TABLE_MAX_ROWS + 5 }, (_, row) => [`${row}`]);
    const pasted = pasteGrid(grid(1, 1), { row: 0, col: 0 }, tall);
    expect(pasted.table.rowHeights).toHaveLength(TABLE_MAX_ROWS);
    expect(pasted.truncated).toBe(true);

    const long = pasteGrid(grid(1, 1), { row: 0, col: 0 }, [['x'.repeat(500)]]);
    expect(tableCellAt(long.table, 0, 0)?.text).toHaveLength(200);
    expect(long.truncated).toBe(true);
  });

  it('copies cells out as text that reads back the same', () => {
    const table = setCell(labelled(2, 2), 0, 1, { text: 'has\ta tab' });
    const text = rangeAsTabularText(table, wholeTableRange(table));
    expect(parseTabularText(text)).toEqual([
      ['0,0', 'has\ta tab'],
      ['1,0', '1,1'],
    ]);
  });
});

describe('a heading row that moves with its row', () => {
  // Written by an older build: the flag, and no styling on the cells.
  const legacy = () => ({ ...labelled(3, 2), headerRow: true });

  it('turns the old heading flag into the first row styling of its own', () => {
    const baked = bakeHeaderRow(legacy());
    expect(baked.headerRow).toBeUndefined();
    expect(tableCellAt(baked, 0, 1)).toMatchObject({ text: '0,1', fill: 'neutral', bold: true });
    expect(tableCellAt(baked, 1, 1)).toEqual({ text: '1,1' });
    // Drawn exactly as before.
    expect(tableCellFill(baked, tableCellAt(baked, 0, 0), 0)).toBe(
      tableCellFill(legacy(), null, 0),
    );
  });

  it('leaves a table without the flag exactly as it is', () => {
    const table = grid(2, 2);
    expect(bakeHeaderRow(table)).toBe(table);
  });

  it('carries the heading with its row when rows move', () => {
    const moved = moveTracks(legacy(), 'row', 0, 0, 3);
    expect(moved.headerRow).toBeUndefined();
    expect(tableCellAt(moved, 2, 0)).toMatchObject({ text: '0,0', fill: 'neutral' });
    expect(tableCellAt(moved, 0, 0)?.fill).toBeUndefined();
  });

  it('does not hand the heading to a row put in above it', () => {
    const inserted = insertRow(legacy(), 0);
    expect(tableCellAt(inserted, 0, 0)).toEqual({});
    expect(tableCellAt(inserted, 1, 0)).toMatchObject({ fill: 'neutral', bold: true });
  });

  it('changes nothing, flag included, when the edit itself changes nothing', () => {
    const table = legacy();
    expect(moveTracks(table, 'row', 1, 1, 1)).toBe(table);
    expect(insertRow({ ...grid(TABLE_MAX_ROWS, 1), headerRow: true }, 0).headerRow).toBe(true);
  });

  it('gives a new column the look of the cells beside it, never their text', () => {
    const styled = setCell(grid(2, 2), 1, 1, { text: 'x', bold: true, align: 'center' });
    const wider = insertColumn(styled, 2);
    expect(tableCellAt(wider, 0, 2)).toEqual({ fill: 'neutral' });
    expect(tableCellAt(wider, 1, 2)).toEqual({ bold: true, align: 'center' });
  });
});

describe('carried rows on their own', () => {
  it('takes rows out as a table of their own', () => {
    const lifted = tracksAsTable(labelled(3, 2), 'row', 1, 2);
    expect(lifted.rowHeights).toHaveLength(2);
    expect(lifted.cells.map((cell) => cell.text)).toEqual(['1,0', '1,1', '2,0', '2,1']);
  });

  it('takes columns out the same way', () => {
    const lifted = tracksAsTable(labelled(2, 3), 'col', 1, 1);
    expect(lifted.colWidths).toHaveLength(1);
    expect(lifted.cells.map((cell) => cell.text)).toEqual(['0,1', '1,1']);
  });
});

describe('merging cells', () => {
  const block = (top: number, left: number, bottom: number, right: number) => ({
    anchor: { row: top, col: left },
    focus: { row: bottom, col: right },
  });
  /** Rows 0-1 of column 0 merged, in a labelled 4x3 grid. */
  const tall = () => mergeCells(labelled(4, 3), block(0, 0, 1, 0));

  it('makes a block one cell, keeping only the top-left cell', () => {
    const merged = mergeCells(labelled(3, 3), block(0, 0, 1, 1));
    expect(merged.merges).toEqual([{ row: 0, col: 0, rowSpan: 2, colSpan: 2 }]);
    expect(tableCellAt(merged, 0, 0)?.text).toBe('0,0');
    expect(tableCellAt(merged, 1, 1)).toEqual({});
    expect(tableCellAt(merged, 0, 1)).toEqual({});
    expect(tableCellAt(merged, 2, 2)?.text).toBe('2,2');
  });

  it('changes nothing for a single cell', () => {
    const table = labelled(2, 2);
    expect(mergeCells(table, block(1, 1, 1, 1))).toBe(table);
  });

  it('takes in any merged cell a block touches, and absorbs it', () => {
    const merged = mergeCells(tall(), block(1, 0, 2, 1));
    expect(merged.merges).toEqual([{ row: 0, col: 0, rowSpan: 3, colSpan: 2 }]);
  });

  it('grows a range until no merged cell sticks out of it, through a chain', () => {
    // Taking in the first merge (down column 1) reaches the second (down
    // column 0, a row lower), which the range did not touch to begin with.
    let table = mergeCells(labelled(4, 4), block(0, 1, 1, 1));
    table = mergeCells(table, block(1, 0, 2, 0));
    expect(expandRangeToMerges(table, block(0, 0, 0, 1))).toEqual(block(0, 0, 2, 1));
    // Dragged up and to the left, it stays that way round.
    expect(expandRangeToMerges(table, block(1, 1, 0, 0))).toEqual(block(2, 1, 0, 0));
  });

  it('splits a merged cell back into its cells', () => {
    const split = unmergeCells(tall(), block(1, 0, 1, 0));
    expect(split.merges).toBeUndefined();
    expect(tableCellAt(split, 0, 0)?.text).toBe('0,0');
    expect(unmergeCells(labelled(2, 2), block(0, 0, 1, 1)).merges).toBeUndefined();
  });

  it('says whether the cells in hand would be merged or split', () => {
    expect(mergeAction(tall(), block(0, 0, 1, 0))).toBe('unmerge');
    expect(mergeAction(tall(), block(0, 0, 0, 1))).toBe('merge');
    expect(mergeAction(labelled(2, 2), block(1, 1, 1, 1))).toBeNull();
  });

  it('lands on a merged cell, and steps off it from its far side', () => {
    const table = tall();
    expect(resolveCell(table, { row: 1, col: 0 })).toEqual({ row: 0, col: 0 });
    expect(cellAtPoint(table, { x: 10, y: 40 })).toEqual({ row: 0, col: 0 });
    expect(moveTableSelection(table, { row: 0, col: 0 }, 'ArrowDown')).toEqual({ row: 2, col: 0 });
    expect(moveTableSelection(table, { row: 1, col: 1 }, 'ArrowLeft')).toEqual({ row: 0, col: 0 });
    // Tab passes over the covered cell in reading order.
    expect(moveTableSelection(table, { row: 0, col: 2 }, 'Tab')).toEqual({ row: 1, col: 1 });
  });

  it('grows a merged cell for a row put in through it, and moves one put in before it', () => {
    expect(insertRow(tall(), 1).merges).toEqual([{ row: 0, col: 0, rowSpan: 3, colSpan: 1 }]);
    expect(insertRow(tall(), 0).merges).toEqual([{ row: 1, col: 0, rowSpan: 2, colSpan: 1 }]);
    expect(insertColumn(tall(), 0).merges).toEqual([{ row: 0, col: 1, rowSpan: 2, colSpan: 1 }]);
  });

  it('keeps the text of a merged cell when its top row goes, and lets go when it is one cell', () => {
    const shorter = deleteRow(tall(), 0);
    expect(shorter.merges).toBeUndefined();
    expect(tableCellAt(shorter, 0, 0)?.text).toBe('0,0');
    const three = mergeCells(labelled(4, 3), block(0, 0, 2, 0));
    expect(deleteRow(three, 3).merges).toEqual([{ row: 0, col: 0, rowSpan: 3, colSpan: 1 }]);
    expect(deleteRow(three, 1).merges).toEqual([{ row: 0, col: 0, rowSpan: 2, colSpan: 1 }]);
  });

  it('refuses to move or copy half a merged cell, or drop rows into one', () => {
    const table = tall();
    expect(blockCutsMerge(table, 'row', 1, 1)).toBe(true);
    expect(canMoveTracks(table, 'row', 2, 2, 1)).toBe(false);
    expect(moveTracks(table, 'row', 1, 1, 4)).toBe(table);
    expect(duplicateTracks(table, 'row', 0, 0)).toBe(table);
  });

  it('carries a merged cell whole with its rows, and copies it with them', () => {
    const moved = moveTracks(tall(), 'row', 0, 1, 4);
    expect(moved.merges).toEqual([{ row: 2, col: 0, rowSpan: 2, colSpan: 1 }]);
    expect(tableCellAt(moved, 2, 0)?.text).toBe('0,0');
    const copied = duplicateTracks(tall(), 'row', 0, 1);
    expect(copied.merges).toEqual([
      { row: 0, col: 0, rowSpan: 2, colSpan: 1 },
      { row: 2, col: 0, rowSpan: 2, colSpan: 1 },
    ]);
  });

  it('puts what a merged cell needs onto the last row it spans', () => {
    const long = 'a merged cell down two rows holding a lot more text than both of them can show';
    const table = setCell(tall(), 0, 0, { text: long });
    const fitted = fitRowsToContent(table, [0], 'grow');
    expect(fitted.rowHeights[0]).toBe(32);
    expect(fitted.rowHeights[1]).toBeGreaterThan(32);
  });

  it('draws no line through a merged cell', () => {
    const merged = mergeCells(grid(2, 2), block(0, 0, 0, 1));
    expect(tableGridPath(merged)).toBe('M128 32V64M0 32H256');
  });

  it('splits the merged cells a paste lands on, and styles only cells that show', () => {
    const pasted = pasteGrid(tall(), { row: 0, col: 0 }, [['a'], ['b']]);
    expect(pasted.table.merges).toBeUndefined();
    expect(tableCellAt(pasted.table, 1, 0)?.text).toBe('b');
    const styled = styleCellRange(tall(), block(0, 0, 1, 0), { bold: true });
    expect(tableCellAt(styled, 1, 0)).toEqual({});
    expect(rangeAsTabularText(tall(), block(0, 0, 1, 0))).toBe('0,0\n');
  });
});

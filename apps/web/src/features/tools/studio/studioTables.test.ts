import { describe, expect, it } from 'vitest';
import {
  TABLE_MAX_COLS,
  TABLE_MAX_ROWS,
  TABLE_MIN_COL_WIDTH,
  tableAutoRowHeight,
  tableCellAt,
  tableCellFill,
  tableCellLines,
  tableColumnOffsets,
  tableSize,
} from '@roundtable/shared';
import { diagramWriteArtifactSchema } from '@roundtable/shared/schemas';

import {
  alignCellRange,
  cellsInRange,
  clampCellRef,
  clearCellRange,
  createTable,
  deleteColumn,
  deleteRow,
  fillCellRange,
  insertColumn,
  insertRow,
  isCellInRange,
  moveTableSelection,
  resizeColumn,
  resizeRow,
  setCell,
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

  it('keeps the grid well-formed for the write contract after every edit', () => {
    let table = labelled(3, 3);
    table = insertRow(table, 1);
    table = insertColumn(table, 2);
    table = deleteRow(table, 0);
    table = deleteColumn(table, 1);
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
    expect(tableSize(table)).toEqual({ width: 216, height: 64 });
    expect(tableColumnOffsets(table)).toEqual([0, 120, 216]);
  });
});

describe('presentation', () => {
  it('tints the first row when it is a header, and not otherwise', () => {
    const table = grid();
    expect(tableCellFill(table, null, 0)).not.toBe(tableCellFill(table, null, 1));
    expect(tableCellFill({ headerRow: false }, null, 0)).toBe(tableCellFill({}, null, 1));
  });

  it('lets a cell fill beat the header tint', () => {
    expect(tableCellFill(grid(), { fill: 'rose' }, 0)).toBe('#FAE0E0');
  });

  it('wraps cell text to its own column', () => {
    const table = setCell(grid(2, 2), 0, 0, { text: 'a much longer heading than fits' });
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

describe('keeping a selection valid', () => {
  it('pulls a selection back inside a grid that just shrank', () => {
    expect(clampCellRef(grid(2, 2), { row: 5, col: 5 })).toEqual({ row: 1, col: 1 });
    expect(clampCellRef(grid(2, 2), { row: -3, col: 0 })).toEqual({ row: 0, col: 0 });
  });
});

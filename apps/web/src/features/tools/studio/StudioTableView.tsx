// One table, drawn.
//
// The studio canvas and the board card both draw tables, and they have to
// agree exactly, so this is a component rather than two copies of the same
// loop. It is presentational: selection washes, hit targets and the cell being
// typed into belong to whichever surface has them, and are handed in through
// the slots below.
//
// The grid is drawn once — fills, then every inside line as one path, then a
// rounded outline — rather than as a bordered rect per cell. Per-cell borders
// stroked every shared edge twice, so the inside of a table read heavier than
// its outline and every corner where four cells met showed as a darker dot.

import { useId, type ReactNode } from 'react';

import {
  TABLE_CELL_PADDING,
  tableAreaSize,
  tableCellArea,
  tableCellAt,
  tableCellBold,
  tableCellColor,
  tableCellFill,
  tableCellFontSize,
  tableCellLines,
  tableColCount,
  tableColumnOffsets,
  tableRowOffsets,
  tableSize,
  tableStrokeColor,
  tableStrokeWidth,
  type TableCell,
  type TableElement,
} from '@roundtable/shared';

import { tableGridPath } from './studioTables';

/** How round a table's outer corners are, in table units. */
export const TABLE_CORNER_RADIUS = 6;

/** Where one cell sits, for a surface drawing its own layer over it. */
export interface TableCellBox {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** More than one when this is a merged cell: how many rows and columns it spans. */
  rowSpan: number;
  colSpan: number;
  cell: TableCell | null;
}

interface StudioTableViewProps {
  table: TableElement;
  /** Drawn over the fills and inside the rounded outline: a selection wash. */
  wash?: (box: TableCellBox) => ReactNode;
  /** Drawn over everything, once per cell: hit targets, or a cell's editor. */
  overlay?: (box: TableCellBox) => ReactNode;
  /** A cell whose text is not drawn, because an editor is standing in for it. */
  hiddenText?: { row: number; col: number } | null;
}

export function StudioTableView({ table, wash, overlay, hiddenText = null }: StudioTableViewProps) {
  const clipId = `table-clip-${useId().replace(/:/g, '')}`;
  const cols = tableColCount(table);
  const colOffsets = tableColumnOffsets(table);
  const rowOffsets = tableRowOffsets(table);
  const size = tableSize(table);
  const stroke = tableStrokeColor(table);
  const strokeWidth = tableStrokeWidth(table);
  const radius = Math.min(TABLE_CORNER_RADIUS, size.width / 2, size.height / 2);

  // One box per cell that shows. A merged cell is one box over everything it
  // spans, drawn from its top-left cell; the cells it covers have none.
  const boxes: TableCellBox[] = table.cells.flatMap((_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const area = tableCellArea(table, row, col);
    if (area.row !== row || area.col !== col) return [];
    const size = tableAreaSize(table, area);
    return [
      {
        row,
        col,
        x: colOffsets[col] ?? 0,
        y: rowOffsets[row] ?? 0,
        width: size.width,
        height: size.height,
        rowSpan: area.rowSpan,
        colSpan: area.colSpan,
        cell: tableCellAt(table, row, col),
      },
    ];
  });

  return (
    <g transform={`translate(${table.x}, ${table.y})`}>
      <defs>
        <clipPath id={clipId}>
          <rect width={size.width} height={size.height} rx={radius} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {boxes.map((box) => (
          <rect
            key={`fill-${box.row}-${box.col}`}
            data-table-cell=""
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            fill={tableCellFill(table, box.cell, box.row)}
          />
        ))}
        {wash ? boxes.map((box) => wash(box)) : null}
      </g>
      <path
        d={tableGridPath(table)}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        pointerEvents="none"
      />
      <rect
        width={size.width}
        height={size.height}
        rx={radius}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        pointerEvents="none"
      />
      {boxes.map((box) =>
        hiddenText && hiddenText.row === box.row && hiddenText.col === box.col ? null : (
          <TableCellText key={`text-${box.row}-${box.col}`} table={table} box={box} />
        ),
      )}
      {overlay ? boxes.map((box) => overlay(box)) : null}
    </g>
  );
}

function TableCellText({ table, box }: { table: TableElement; box: TableCellBox }) {
  const { row, col, x, y, width, height, cell } = box;
  const lines = tableCellLines(table, cell, col, row);
  if (lines.length === 0) return null;
  const fontSize = tableCellFontSize(table, cell);
  const lineHeight = fontSize * 1.25;
  const align = cell?.align ?? 'left';
  const textX =
    align === 'center'
      ? x + width / 2
      : align === 'right'
        ? x + width - TABLE_CELL_PADDING
        : x + TABLE_CELL_PADDING;
  return (
    <text
      fill={tableCellColor(cell)}
      textAnchor={align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'}
      style={{
        fontSize: `${fontSize}px`,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: tableCellBold(table, cell, row) ? 600 : 400,
      }}
      pointerEvents="none"
    >
      {lines.map((line, lineIndex) => (
        <tspan
          key={line + String(lineIndex)}
          x={textX}
          y={
            y +
            height / 2 +
            fontSize / 3 -
            ((lines.length - 1) * lineHeight) / 2 +
            lineIndex * lineHeight
          }
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

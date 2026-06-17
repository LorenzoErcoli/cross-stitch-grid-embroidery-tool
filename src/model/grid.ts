import type { Cell, GridConfig } from "./types";

export const DEFAULT_GRID: GridConfig = {
  rows: 8,
  columns: 10,
  cellWidth: 28,
  cellHeight: 28,
  gapX: 0,
  gapY: 0,
};

export const cellKey = (row: number, col: number) => `${row}:${col}`;

export function getGridWarnings(grid: GridConfig): string[] {
  const warnings: string[] = [];
  if (grid.cellWidth + grid.gapX <= 0) warnings.push("Cell width + Gap X must be greater than 0.");
  if (grid.cellHeight + grid.gapY <= 0) warnings.push("Cell height + Gap Y must be greater than 0.");
  return warnings;
}

export function createCells(grid: GridConfig, enabledKeys = new Set<string>()): Cell[] {
  return Array.from({ length: grid.rows * grid.columns }, (_, index) => {
    const row = Math.floor(index / grid.columns);
    const col = index % grid.columns;
    const enabled = enabledKeys.has(cellKey(row, col));
    return { row, col, enabled, orientation: enabled ? "diagonalDown" : null };
  });
}

export function resizeCells(cells: Cell[], grid: GridConfig): Cell[] {
  const existing = new Map(cells.map((cell) => [cellKey(cell.row, cell.col), cell]));
  return createCells(grid).map((cell) => existing.get(cellKey(cell.row, cell.col)) ?? cell);
}

export function setCellOrientation(
  cells: Cell[],
  row: number,
  col: number,
  orientation: Cell["orientation"],
): Cell[] {
  return cells.map((cell) =>
    cell.row === row && cell.col === col
      ? { ...cell, enabled: orientation !== null, orientation }
      : cell,
  );
}

export function gridSize(grid: GridConfig) {
  const stepX = Math.max(1, grid.cellWidth + grid.gapX);
  const stepY = Math.max(1, grid.cellHeight + grid.gapY);
  return {
    width: (grid.columns - 1) * stepX + grid.cellWidth,
    height: (grid.rows - 1) * stepY + grid.cellHeight,
  };
}

import type { Cell, CellGeometry, GridConfig } from "./types";

export function generateCellGeometry(cell: Cell, grid: GridConfig): CellGeometry {
  const x = cell.col * (grid.cellWidth + grid.gapX);
  const y = cell.row * (grid.cellHeight + grid.gapY);

  return {
    cell,
    vertices: {
      topLeft: { x, y },
      topRight: { x: x + grid.cellWidth, y },
      bottomLeft: { x, y: y + grid.cellHeight },
      bottomRight: { x: x + grid.cellWidth, y: y + grid.cellHeight },
    },
  };
}

export function generatePatternGeometry(cells: Cell[], grid: GridConfig): CellGeometry[] {
  return cells
    .filter((cell) => cell.enabled)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((cell) => generateCellGeometry(cell, grid));
}

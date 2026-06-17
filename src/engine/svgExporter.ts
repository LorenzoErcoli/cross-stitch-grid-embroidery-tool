import { gridSize } from "../model/grid";
import type { Cell, EngineOutput, GridConfig } from "../model/types";

export function createSvg(
  output: EngineOutput,
  grid: GridConfig,
  cells: Cell[],
  includeGrid: boolean,
): string {
  const size = gridSize(grid);
  const margin = 12;
  const gridMarkup = includeGrid
    ? cells
        .map((cell) => {
          const x = cell.col * (grid.cellWidth + grid.gapX);
          const y = cell.row * (grid.cellHeight + grid.gapY);
          return `<rect x="${x}" y="${y}" width="${grid.cellWidth}" height="${grid.cellHeight}" />`;
        })
        .join("")
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width + margin * 2}mm" height="${size.height + margin * 2}mm" viewBox="${-margin} ${-margin} ${size.width + margin * 2} ${size.height + margin * 2}" fill="none">
  ${includeGrid ? `<g stroke="#d8d4df" stroke-width="0.75">${gridMarkup}</g>` : ""}
  <path d="${output.finalPath}" stroke="#6d3df5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;
}

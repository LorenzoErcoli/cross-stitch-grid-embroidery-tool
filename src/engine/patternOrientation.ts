import type { CellGeometry, OrientedCellGeometry } from "../model/types";

export function assignPatternOrientation(
  geometry: CellGeometry[],
): OrientedCellGeometry[] {
  return [...geometry]
    .sort((a, b) => a.cell.row - b.cell.row || a.cell.col - b.cell.col)
    .flatMap((item, index) =>
      item.cell.orientation
        ? [{ ...item, orientation: item.cell.orientation, patternOrder: index + 1 }]
        : [],
    );
}

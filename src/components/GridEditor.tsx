import type { Cell, GridConfig } from "../model/types";
import { gridSize } from "../model/grid";

interface Props {
  cells: Cell[];
  grid: GridConfig;
  disabled?: boolean;
  onSetOrientation: (row: number, col: number, orientation: Cell["orientation"]) => void;
}

export function GridEditor({ cells, grid, disabled = false, onSetOrientation }: Props) {
  const size = gridSize(grid);
  const activeCells = cells.filter((cell) => cell.enabled);
  const stepX = grid.cellWidth + grid.gapX;
  const stepY = grid.cellHeight + grid.gapY;

  const setFromPointer = (
    event: React.MouseEvent<SVGRectElement>,
    orientation: Cell["orientation"],
  ) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg || stepX <= 0 || stepY <= 0) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const svgPoint = point.matrixTransform(matrix.inverse());
    const col = Math.floor(svgPoint.x / stepX);
    const row = Math.floor(svgPoint.y / stepY);
    const xInCell = svgPoint.x - col * stepX;
    const yInCell = svgPoint.y - row * stepY;
    if (row < 0 || row >= grid.rows || col < 0 || col >= grid.columns) return;
    if (xInCell < 0 || xInCell > grid.cellWidth || yInCell < 0 || yInCell > grid.cellHeight) return;
    onSetOrientation(row, col, event.shiftKey ? null : orientation);
  };

  return (
    <g className="grid-editor">
      {activeCells.map((cell) => {
        const x = cell.col * (grid.cellWidth + grid.gapX);
        const y = cell.row * (grid.cellHeight + grid.gapY);
        return (
          <rect
            key={`${cell.row}:${cell.col}`}
            x={x}
            y={y}
            width={grid.cellWidth}
            height={grid.cellHeight}
            rx={2}
            className={`editor-cell${cell.enabled ? " active" : ""}${cell.orientation ? ` ${cell.orientation}` : ""}`}
          />
        );
      })}
      <rect
        x={0}
        y={0}
        width={size.width}
        height={size.height}
        className="grid-hit-overlay"
        onClick={(event) => {
          if (disabled) return;
          setFromPointer(event, "diagonalDown");
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (disabled) return;
          setFromPointer(event, "diagonalUp");
        }}
      />
    </g>
  );
}

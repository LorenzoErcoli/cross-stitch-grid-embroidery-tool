import { generatePatternGeometry } from "../model/geometry";
import type { Cell, GridConfig, OrientedCellGeometry, PatternPrimitive } from "../model/types";
import { assignPatternOrientation } from "./patternOrientation";

export interface GeneratedPattern {
  primitive: PatternPrimitive;
  geometry: OrientedCellGeometry[];
}

export function generatePattern(
  cells: Cell[],
  grid: GridConfig,
  primitive: PatternPrimitive,
): GeneratedPattern {
  if (primitive.type !== "alternatingDiagonal") {
    throw new Error(`Unsupported pattern primitive: ${primitive.type}`);
  }

  return { primitive, geometry: assignPatternOrientation(generatePatternGeometry(cells, grid)) };
}

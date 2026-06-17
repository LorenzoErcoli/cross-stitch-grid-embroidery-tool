import type { GridConfig } from "./types";

export interface AdaptiveVisualSizes {
  stitchStrokeWidth: number;
  connectorStrokeWidth: number;
  debugPointRadius: number;
  contactPointRadius: number;
  sharedVertexRadius: number;
  routeLabelFontSize: number;
  gridStrokeWidth: number;
  smallCellMode: boolean;
  showRouteLabels: boolean;
  showDetailedGrid: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function getAdaptiveVisualSizes(config: GridConfig, zoomLevel: number): AdaptiveVisualSizes {
  const minCell = Math.max(0.001, Math.min(config.cellWidth, config.cellHeight));
  const zoomCorrection = clamp(zoomLevel, 0.4, 4);
  const smallCellMode = config.cellWidth <= 3 || config.cellHeight <= 3;
  const reduction = smallCellMode ? 0.45 : 1;

  const debugPointRadius = Math.max(0.12, Math.min(3, config.cellWidth * 0.18, config.cellHeight * 0.18) * reduction / zoomCorrection);
  const connectorStrokeWidth = Math.max(0.08, Math.min(2, config.cellWidth * 0.12, config.cellHeight * 0.12) * reduction / zoomCorrection);
  const routeLabelFontSize = Math.max(0.8, Math.min(10, config.cellWidth * 0.35, config.cellHeight * 0.35) * reduction / zoomCorrection);

  return {
    stitchStrokeWidth: Math.max(0.1, Math.min(2.2, minCell * 0.14) / zoomCorrection),
    connectorStrokeWidth,
    debugPointRadius,
    contactPointRadius: debugPointRadius * (smallCellMode ? 1 : 1.15),
    sharedVertexRadius: debugPointRadius,
    routeLabelFontSize,
    gridStrokeWidth: Math.max(0.04, Math.min(0.75, minCell * 0.05) / zoomCorrection),
    smallCellMode,
    showRouteLabels: !smallCellMode && routeLabelFontSize >= 1.8,
    showDetailedGrid: zoomLevel >= (minCell <= 3 ? 2.2 : 0.85),
  };
}

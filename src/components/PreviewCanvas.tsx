import { useEffect, useMemo, useRef, useState } from "react";
import { gridSize } from "../model/grid";
import type { Cell, DebugOptions, EditorViewState, Edge, EngineOutput, GridConfig, ManualRouteOverride, Point, VertexGraph } from "../model/types";
import { getAdaptiveVisualSizes } from "../model/visual";
import { GridEditor } from "./GridEditor";

interface Props {
  cells: Cell[];
  grid: GridConfig;
  graph: VertexGraph;
  output: EngineOutput;
  debug: DebugOptions;
  manualMode: boolean;
  selectedConnectorId: string | null;
  selectedPointIndex: number | null;
  manualOverrides: ManualRouteOverride[];
  showManualConnectors: boolean;
  showOverriddenAutoConnectors: boolean;
  showStitchDebugPoints: boolean;
  showManualPoints: boolean;
  showSnapAreas: boolean;
  showHitAreas: boolean;
  viewState: EditorViewState;
  clearAllSignal: number;
  onViewStateChange: (viewState: EditorViewState) => void;
  onSelectConnector: (connectorId: string) => void;
  onAddManualPoint: (point: Point) => void;
  onSelectManualPoint: (connectorId: string, pointIndex: number) => void;
  onMoveManualPoint: (connectorId: string, pointIndex: number, point: Point) => void;
  onRemoveSelectedManualPoint: () => void;
  onClearManualSelection: () => void;
  onSetOrientation: (row: number, col: number, orientation: Cell["orientation"]) => void;
}

export function PreviewCanvas({
  cells,
  grid,
  graph,
  output,
  debug,
  manualMode,
  selectedConnectorId,
  selectedPointIndex,
  manualOverrides,
  showManualConnectors,
  showOverriddenAutoConnectors,
  showStitchDebugPoints,
  showManualPoints,
  showSnapAreas,
  showHitAreas,
  viewState,
  clearAllSignal,
  onViewStateChange,
  onSelectConnector,
  onAddManualPoint,
  onSelectManualPoint,
  onMoveManualPoint,
  onRemoveSelectedManualPoint,
  onClearManualSelection,
  onSetOrientation,
}: Props) {
  const size = gridSize(grid);
  const margin = 34;
  const minZoom = 0.25;
  const maxZoom = 24;
  const stitchRouteSteps = output.routeSteps.filter((step) => step.edge.type === "stitch");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoom = viewState.zoom;
  const pan = viewState.pan;
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointer, setLastPointer] = useState<{ x: number; y: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceVisible, setReferenceVisible] = useState(true);
  const [referenceLocked, setReferenceLocked] = useState(false);
  const [referenceOpacity, setReferenceOpacity] = useState(0.35);
  const [referenceScale, setReferenceScale] = useState(1);
  const [referenceOffset, setReferenceOffset] = useState({ x: 0, y: 0 });
  const [referenceSize, setReferenceSize] = useState({ width: size.width, height: size.height });
  const viewWidth = (size.width + margin * 2) / zoom;
  const viewHeight = (size.height + margin * 2) / zoom;
  const viewBox = `${-margin + pan.x} ${-margin + pan.y} ${viewWidth} ${viewHeight}`;
  const imageWidth = referenceSize.width * referenceScale;
  const imageHeight = referenceSize.height * referenceScale;
  const visual = getAdaptiveVisualSizes(grid, zoom);
  const gridStepX = grid.cellWidth + grid.gapX;
  const gridStepY = grid.cellHeight + grid.gapY;
  const minCell = Math.max(0.001, Math.min(Math.abs(grid.cellWidth), Math.abs(grid.cellHeight)));
  const detailZoomThreshold = minCell <= 3 ? 2.5 : 0.7;
  const detailMode = zoom >= detailZoomThreshold;
  const screenScale = svgRef.current
    ? Math.max(0.001, svgRef.current.getBoundingClientRect().width / Math.max(0.001, viewWidth))
    : Math.max(0.001, zoom);
  const screenToWorld = (pixels: number) => pixels / screenScale;
  const editorStrokeWidth = screenToWorld(2);
  const connectorHitStrokeWidth = screenToWorld(10);
  const manualNodeRadius = screenToWorld(7);
  const manualHitRadius = Math.max(
    screenToWorld(10),
    Math.min(Math.abs(grid.cellWidth) * 0.35, Math.abs(grid.cellHeight) * 0.35, screenToWorld(14)),
  );
  const snapRadius = Math.max(screenToWorld(5), Math.min(minCell * 0.35, screenToWorld(9)));
  const majorGridLines = useMemo(() => {
    const lines: { key: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    if (gridStepX <= 0 || gridStepY <= 0) return lines;
    for (let col = 0; col <= grid.columns; col += 10) {
      const x = Math.min(col * gridStepX, size.width);
      lines.push({ key: `major-x-${col}`, x1: x, y1: 0, x2: x, y2: size.height });
    }
    for (let row = 0; row <= grid.rows; row += 10) {
      const y = Math.min(row * gridStepY, size.height);
      lines.push({ key: `major-y-${row}`, x1: 0, y1: y, x2: size.width, y2: y });
    }
    return lines;
  }, [grid.columns, grid.rows, gridStepX, gridStepY, size.width, size.height]);
  const automaticConnectorEdges = useMemo(
    () => [
      ...output.visibleConnectorEdges,
      ...output.coveredConnectorEdges,
      ...output.contactConnectorEdges,
      ...output.verticalVertexConnectorEdges,
      ...output.lShapeConnectorEdges,
      ...output.retraceConnectorEdges,
    ],
    [output],
  );
  const overriddenConnectorIds = useMemo(
    () => new Set(manualOverrides.map((override) => override.connectorId)),
    [manualOverrides],
  );
  const overriddenAutoConnectorEdges = useMemo(
    () => automaticConnectorEdges.filter((edge) => overriddenConnectorIds.has(edge.id)),
    [automaticConnectorEdges, overriddenConnectorIds],
  );
  const extraSnapPoints = useMemo(() => {
    const points: Point[] = [];
    for (const point of Object.values(graph.contactPoints ?? {})) {
      const vertex = graph.vertices[point.vertexId];
      if (vertex) points.push({ x: vertex.x, y: vertex.y });
    }
    for (const vertex of output.routeVertices) {
      points.push({ x: vertex.x, y: vertex.y });
    }
    return points;
  }, [graph.contactPoints, graph.vertices, output.routeVertices]);
  const updateZoom = (nextZoom: number) => onViewStateChange({ ...viewState, zoom: Math.min(maxZoom, Math.max(minZoom, nextZoom)) });
  const updatePan = (nextPan: Point) => onViewStateChange({ ...viewState, pan: nextPan });
  const eventPoint = (event: React.MouseEvent<SVGSVGElement> | React.PointerEvent<SVGSVGElement | SVGCircleElement>): Point | null => {
    const svg = event.currentTarget instanceof SVGSVGElement ? event.currentTarget : event.currentTarget.ownerSVGElement;
    if (!svg) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const svgPoint = point.matrixTransform(matrix.inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  };
  const snapPoint = (point: Point): Point => {
    const gridPoint = {
      x: Math.max(0, Math.min(size.width, Math.round(point.x / Math.max(0.001, gridStepX)) * gridStepX)),
      y: Math.max(0, Math.min(size.height, Math.round(point.y / Math.max(0.001, gridStepY)) * gridStepY)),
    };
    const nearest = extraSnapPoints.reduce(
      (best, candidate) => {
        const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
        return distance < best.distance ? { point: candidate, distance } : best;
      },
      { point: gridPoint, distance: Math.hypot(gridPoint.x - point.x, gridPoint.y - point.y) },
    );
    return nearest.distance <= snapRadius ? nearest.point : gridPoint;
  };
  const fitImage = () => {
    if (!referenceImage || imageWidth <= 0 || imageHeight <= 0) return;
    const nextZoom = Math.min(
      maxZoom,
      Math.max(minZoom, Math.min((size.width + margin * 2) / (imageWidth + margin * 2), (size.height + margin * 2) / (imageHeight + margin * 2))),
    );
    onViewStateChange({ zoom: nextZoom, pan: { x: referenceOffset.x, y: referenceOffset.y } });
  };

  useEffect(() => {
    setReferenceImage((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setReferenceVisible(true);
    setReferenceLocked(false);
    setReferenceOpacity(0.35);
    setReferenceScale(1);
    setReferenceOffset({ x: 0, y: 0 });
    setReferenceSize({ width: size.width, height: size.height });
  }, [clearAllSignal]);
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="canvas-shell">
      <div className="canvas-label">
        Interactive route canvas
        <span>Left click: \</span>
        <span>Right click: /</span>
        <span>Shift + click: clear</span>
      </div>
      <div className="canvas-tools">
        <button type="button" onClick={() => updateZoom(zoom * 1.25)}>Zoom in</button>
        <button type="button" onClick={() => updateZoom(zoom / 1.25)}>Zoom out</button>
        <button type="button" onClick={() => onViewStateChange({ zoom: 1, pan: { x: 0, y: 0 } })}>Reset view</button>
        <span className="zoom-readout">{zoomPercent}%</span>
        <span className="zoom-readout">{detailMode ? "Detail" : "Schematic"}</span>
      </div>
      <div className="reference-tools">
        <label>
          Reference image
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const url = URL.createObjectURL(file);
              const image = new Image();
              image.onload = () => {
                setReferenceSize({ width: image.naturalWidth, height: image.naturalHeight });
                setReferenceOffset({ x: 0, y: 0 });
                setReferenceScale(Math.min(1, size.width / Math.max(1, image.naturalWidth)));
                setReferenceImage((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return url;
                });
                setReferenceVisible(true);
              };
              image.src = url;
            }}
          />
        </label>
        <button type="button" onClick={fitImage}>Fit Image</button>
        <button
          type="button"
          onClick={() => {
            setReferenceImage((current) => {
              if (current) URL.revokeObjectURL(current);
              return null;
            });
            setReferenceOffset({ x: 0, y: 0 });
            setReferenceScale(1);
            setReferenceOpacity(0.35);
            setReferenceSize({ width: size.width, height: size.height });
          }}
        >
          Delete Image
        </button>
        <label><input type="checkbox" checked={referenceVisible} onChange={() => setReferenceVisible(!referenceVisible)} /> Show</label>
        <label><input type="checkbox" checked={referenceLocked} onChange={() => setReferenceLocked(!referenceLocked)} /> Lock</label>
        <label>Opacity <input type="range" min="0" max="1" step="0.05" value={referenceOpacity} onChange={(event) => setReferenceOpacity(Number(event.target.value))} /></label>
        <label>Scale <input type="number" min="0.1" max="8" step="0.1" value={referenceScale} onChange={(event) => setReferenceScale(Number(event.target.value))} /></label>
        <label>X <input type="number" value={referenceOffset.x} disabled={referenceLocked} onChange={(event) => setReferenceOffset({ ...referenceOffset, x: Number(event.target.value) })} /></label>
        <label>Y <input type="number" value={referenceOffset.y} disabled={referenceLocked} onChange={(event) => setReferenceOffset({ ...referenceOffset, y: Number(event.target.value) })} /></label>
        <span className="reference-debug">
          Image: {referenceImage ? "loaded" : "none"} | Native: {referenceSize.width.toFixed(0)}x{referenceSize.height.toFixed(0)} px | Effective: {imageWidth.toFixed(1)}x{imageHeight.toFixed(1)} mm | Position: {referenceOffset.x},{referenceOffset.y} | Scale: {referenceScale.toFixed(2)} | Opacity: {referenceOpacity.toFixed(2)}
        </span>
      </div>
      <svg
        ref={svgRef}
        className="preview-svg"
        viewBox={viewBox}
        aria-label="Embroidery path preview"
        onContextMenu={(event) => event.preventDefault()}
        onWheel={(event) => {
          event.preventDefault();
          const direction = event.deltaY < 0 ? 1 : -1;
          const factor = direction > 0 ? 1.15 : 1 / 1.15;
          updateZoom(zoom * factor);
        }}
        onClick={(event) => {
          if (!manualMode || !selectedConnectorId) return;
          const point = eventPoint(event);
          if (!point) return;
          const snapped = snapPoint(point);
          if (selectedPointIndex !== null) {
            onMoveManualPoint(selectedConnectorId, selectedPointIndex, snapped);
          } else {
            onAddManualPoint(snapped);
          }
        }}
        tabIndex={0}
        onKeyDown={(event) => {
          if (manualMode && (event.key === "Delete" || event.key === "Backspace")) {
            if (selectedConnectorId && selectedPointIndex !== null) {
              event.preventDefault();
              onRemoveSelectedManualPoint();
            }
            return;
          }
          if (manualMode && event.key === "Escape") {
            event.preventDefault();
            onClearManualSelection();
            return;
          }
          if (event.code === "Space") {
            event.preventDefault();
            setSpaceDown(true);
          }
        }}
        onKeyUp={(event) => {
          if (event.code === "Space") setSpaceDown(false);
        }}
        onPointerDown={(event) => {
          event.currentTarget.focus();
          if (event.button === 1 || (spaceDown && event.button === 0)) {
            event.preventDefault();
            setIsPanning(true);
            setLastPointer({ x: event.clientX, y: event.clientY });
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerMove={(event) => {
          if (!isPanning || !lastPointer) return;
          const dx = (lastPointer.x - event.clientX) / zoom;
          const dy = (lastPointer.y - event.clientY) / zoom;
          updatePan({ x: pan.x + dx, y: pan.y + dy });
          setLastPointer({ x: event.clientX, y: event.clientY });
        }}
        onPointerUp={() => {
          setIsPanning(false);
          setLastPointer(null);
        }}
      >
        <defs>
          <filter id="route-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="minor-grid-pattern" width={Math.max(0.001, gridStepX)} height={Math.max(0.001, gridStepY)} patternUnits="userSpaceOnUse">
            <path
              d={`M ${grid.cellWidth} 0 L ${grid.cellWidth} ${grid.cellHeight} L 0 ${grid.cellHeight}`}
              className="minor-grid-pattern-line"
              style={{ strokeWidth: visual.gridStrokeWidth }}
            />
          </pattern>
        </defs>

        {referenceImage && referenceVisible && (
          <image
            href={referenceImage}
            x={referenceOffset.x}
            y={referenceOffset.y}
            width={imageWidth}
            height={imageHeight}
            opacity={referenceOpacity}
            preserveAspectRatio="xMinYMin meet"
            className="reference-image"
          />
        )}

        {debug.showImageBounds && referenceImage && (
          <g className="image-bounds">
            <rect x={referenceOffset.x} y={referenceOffset.y} width={imageWidth} height={imageHeight} />
            <text x={referenceOffset.x + 4} y={referenceOffset.y + 10}>
              image x:{referenceOffset.x} y:{referenceOffset.y} w:{imageWidth.toFixed(1)} h:{imageHeight.toFixed(1)} scale:{referenceScale.toFixed(2)}
            </text>
          </g>
        )}

        <GridEditor cells={cells} grid={grid} disabled={manualMode} onSetOrientation={onSetOrientation} />

        {debug.showGrid && (
          <g className="grid-layer">
            {visual.showDetailedGrid && (
              <rect x={0} y={0} width={size.width} height={size.height} fill="url(#minor-grid-pattern)" />
            )}
            {majorGridLines.map((line) => (
              <line
                key={line.key}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                className="major-grid-line"
                style={{ strokeWidth: visual.gridStrokeWidth * 1.8 }}
              />
            ))}
          </g>
        )}

        {output.finalPath && <path d={output.finalPath} className="final-route" style={{ strokeWidth: visual.stitchStrokeWidth }} />}

        {debug.showStitchSegments && (!manualMode || showStitchDebugPoints) && output.stitchEdges.map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          return <line key={edge.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="stitch-segment" style={{ strokeWidth: visual.stitchStrokeWidth }} />;
        })}

        {debug.showConnectorSegments && output.coveredConnectorEdges.filter((edge) => !overriddenConnectorIds.has(edge.id)).map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          return <line key={edge.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="covered-connector-segment" style={{ strokeWidth: visual.connectorStrokeWidth }} />;
        })}

        {debug.showConnectorSegments && output.visibleConnectorEdges.filter((edge) => !overriddenConnectorIds.has(edge.id)).map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          return <line key={edge.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="visible-connector-segment" style={{ strokeWidth: visual.connectorStrokeWidth }} />;
        })}

        {showOverriddenAutoConnectors && overriddenAutoConnectorEdges.map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          if (!start || !end) return null;
          return (
            <line
              key={`overridden-${edge.id}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              className={`overridden-auto-connector${manualMode ? " selectable" : ""}${selectedConnectorId === edge.id ? " selected" : ""}`}
              style={{ strokeWidth: visual.connectorStrokeWidth }}
              onClick={manualMode ? (event) => {
                event.stopPropagation();
                onSelectConnector(edge.id);
              } : undefined}
            />
          );
        })}

        {manualMode && automaticConnectorEdges.map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          if (!start || !end) return null;
          return (
            <line
              key={`select-${edge.id}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              className={`connector-select-hit${selectedConnectorId === edge.id ? " selected" : ""}`}
              style={{ strokeWidth: connectorHitStrokeWidth, opacity: showHitAreas || selectedConnectorId === edge.id ? 1 : 0 }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectConnector(edge.id);
              }}
            />
          );
        })}

        {showManualConnectors && output.manualConnectorEdges.map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          return <line key={edge.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="manual-connector-segment" style={{ strokeWidth: editorStrokeWidth }} />;
        })}

        {showManualConnectors && output.manualRetraceConnectorEdges.map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          return <line key={edge.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="manual-retrace-connector-segment" style={{ strokeWidth: editorStrokeWidth }} />;
        })}

        {manualMode && detailMode && showSnapAreas && extraSnapPoints.map((point, index) => (
          <circle key={`snap-${index}`} cx={point.x} cy={point.y} r={snapRadius} className="snap-area" />
        ))}

        {manualMode && showManualPoints && manualOverrides.map((override) => override.points.map((point, pointIndex) => (
          <g key={`${override.id}-${pointIndex}`}>
            {showHitAreas && <circle cx={point.x} cy={point.y} r={manualHitRadius} className="manual-hit-area" />}
            <circle
              cx={point.x}
              cy={point.y}
              r={manualHitRadius}
              className="manual-point-hit"
              onClick={(event) => {
                event.stopPropagation();
                onSelectManualPoint(override.connectorId, pointIndex);
              }}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r={manualNodeRadius}
              className={`manual-point${selectedConnectorId === override.connectorId && selectedPointIndex === pointIndex ? " selected" : ""}`}
              style={{ strokeWidth: editorStrokeWidth }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectManualPoint(override.connectorId, pointIndex);
              }}
            />
          </g>
        )))}

        {debug.showConnectorSegments && output.contactConnectorEdges.filter((edge) => !overriddenConnectorIds.has(edge.id)).map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          return <line key={edge.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="contact-connector-segment" style={{ strokeWidth: visual.connectorStrokeWidth }} />;
        })}

        {debug.showConnectorSegments && output.verticalVertexConnectorEdges.filter((edge) => !overriddenConnectorIds.has(edge.id)).map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          return <line key={edge.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="vertical-vertex-connector-segment" style={{ strokeWidth: visual.connectorStrokeWidth }} />;
        })}

        {debug.showConnectorSegments && output.lShapeConnectorEdges.filter((edge) => !overriddenConnectorIds.has(edge.id)).map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          return <line key={edge.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="l-shape-connector-segment" style={{ strokeWidth: visual.connectorStrokeWidth }} />;
        })}

        {debug.showConnectorSegments && output.retraceConnectorEdges.filter((edge) => !overriddenConnectorIds.has(edge.id)).map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          return <line key={edge.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="retrace-connector-segment" style={{ strokeWidth: visual.connectorStrokeWidth }} />;
        })}

        {debug.showCandidateConnectors && (!manualMode || showStitchDebugPoints) && output.connectorCandidates.flatMap((candidate) =>
          candidate.edges.map((edge, edgeIndex) => {
            const start = graph.vertices[edge.startVertex];
            const end = graph.vertices[edge.endVertex];
            return (
              <line
                key={`${candidate.id}-${edgeIndex}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                className="candidate-connector-segment"
                style={{ strokeWidth: visual.connectorStrokeWidth * 0.7 }}
              />
            );
          }),
        )}

        {debug.showContactPointGraph && (!manualMode || showStitchDebugPoints) && (
          <g className="contact-point-graph">
            {output.contactPointGraph.edges.map((edge) => {
              const start = graph.vertices[edge.startVertex];
              const end = graph.vertices[edge.endVertex];
              return (
                <line
                  key={edge.id}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  style={{ strokeWidth: visual.connectorStrokeWidth * 0.8 }}
                />
              );
            })}
            {output.contactPointGraph.nodes.map((point) => {
              const vertex = graph.vertices[point.vertexId];
              return <circle key={`cpg-${point.id}`} cx={vertex.x} cy={vertex.y} r={visual.contactPointRadius * 0.75} />;
            })}
          </g>
        )}

        {debug.showPatternOrder && (!manualMode || showStitchDebugPoints) && output.stitchEdges.filter((edge) => edge.repetition === 0).map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          return (
            <text
              key={`pattern-${edge.id}`}
              x={(start.x + end.x) / 2}
              y={(start.y + end.y) / 2 - visual.routeLabelFontSize}
              className="pattern-order-label"
              style={{ fontSize: visual.routeLabelFontSize }}
            >
              P{edge.patternOrder}
            </text>
          );
        })}

        {debug.showPatternOrientation && (!manualMode || showStitchDebugPoints) && output.stitchEdges.filter((edge) => edge.repetition === 0).map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          return (
            <text
              key={`orientation-${edge.id}`}
              x={(start.x + end.x) / 2}
              y={(start.y + end.y) / 2 + visual.routeLabelFontSize}
              className="orientation-label"
              style={{ fontSize: visual.routeLabelFontSize * 1.4 }}
            >
              {edge.orientation === "diagonalDown" ? "\\" : "/"}
            </text>
          );
        })}

        {debug.showConnectorLengths && (!manualMode || showStitchDebugPoints) && [...output.coveredConnectorEdges, ...output.visibleConnectorEdges, ...output.contactConnectorEdges, ...output.verticalVertexConnectorEdges, ...output.lShapeConnectorEdges, ...output.retraceConnectorEdges].map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          return (
            <text
              key={`length-${edge.id}`}
              x={(start.x + end.x) / 2}
              y={(start.y + end.y) / 2 - visual.routeLabelFontSize * 0.6}
              className="connector-length-label"
              style={{ fontSize: visual.routeLabelFontSize }}
            >
              {Math.hypot(end.x - start.x, end.y - start.y).toFixed(1)}
            </text>
          );
        })}

        {debug.showConnectorCost && (!manualMode || showStitchDebugPoints) && [...output.coveredConnectorEdges, ...output.visibleConnectorEdges, ...output.contactConnectorEdges, ...output.verticalVertexConnectorEdges, ...output.lShapeConnectorEdges, ...output.retraceConnectorEdges].map((edge) => {
          const start = graph.vertices[edge.startVertex];
          const end = graph.vertices[edge.endVertex];
          return (
            <text
              key={`cost-${edge.id}`}
              x={(start.x + end.x) / 2}
              y={(start.y + end.y) / 2 + visual.routeLabelFontSize}
              className="connector-cost-label"
              style={{ fontSize: visual.routeLabelFontSize }}
            >
              c:{edge.cost?.toFixed(1) ?? "-"}
            </text>
          );
        })}

        {debug.showBlocks && (!manualMode || showStitchDebugPoints) && output.blocks.map((block) => {
          const entry = block.entryVertex ? graph.vertices[block.entryVertex] : undefined;
          const exit = block.exitVertex ? graph.vertices[block.exitVertex] : undefined;
          return (
            <g key={block.id} className="block-debug">
              <rect
                x={block.boundingBox.x - visual.debugPointRadius}
                y={block.boundingBox.y - visual.debugPointRadius}
                width={block.boundingBox.width + visual.debugPointRadius * 2}
                height={block.boundingBox.height + visual.debugPointRadius * 2}
                style={{ strokeWidth: visual.connectorStrokeWidth }}
              />
              <text x={block.boundingBox.x - 2} y={block.boundingBox.y - visual.routeLabelFontSize} style={{ fontSize: visual.routeLabelFontSize }}>
                {block.id} #{block.order}
              </text>
              {entry && <circle cx={entry.x} cy={entry.y} r={visual.debugPointRadius} className="block-entry" />}
              {exit && <circle cx={exit.x} cy={exit.y} r={visual.debugPointRadius} className="block-exit" />}
            </g>
          );
        })}

        {debug.showRowGroups && (!manualMode || showStitchDebugPoints) && graph.rowGroups?.map((group) => {
          const rowEdges = group.edgeIds.map((id) => output.stitchEdges.find((edge) => edge.id === id)).filter(Boolean);
          const first = rowEdges[0];
          if (!first) return null;
          const start = graph.vertices[first.startVertex];
          return (
            <text key={`row-${group.row}`} x={start.x} y={start.y - 10} className="row-group-label">
              row {group.row + 1} {group.direction === "leftToRight" ? "L-R" : "R-L"}
            </text>
          );
        })}

        {debug.showVertices && (!manualMode || showStitchDebugPoints) && Object.values(graph.vertices).map((vertex) => (
          <circle key={vertex.id} cx={vertex.x} cy={vertex.y} r={visual.debugPointRadius} className="vertex" />
        ))}

        {debug.showSharedVertices && (!manualMode || showStitchDebugPoints) && graph.sharedVertexIds?.map((vertexId) => {
          const vertex = graph.vertices[vertexId];
          return <circle key={`shared-${vertexId}`} cx={vertex.x} cy={vertex.y} r={visual.sharedVertexRadius} className="shared-vertex" />;
        })}

        {debug.showContactPoints && (!manualMode || showStitchDebugPoints) && Object.values(graph.contactPoints ?? {}).map((point) => {
          const vertex = graph.vertices[point.vertexId];
          return <circle key={point.id} cx={vertex.x} cy={vertex.y} r={visual.contactPointRadius} className="contact-point" />;
        })}

        {debug.showEdgeIds && (!manualMode || showStitchDebugPoints) && output.routeSteps.map((step) => (
          <text
            key={`id-${step.edge.id}`}
            x={(step.start.x + step.end.x) / 2}
            y={(step.start.y + step.end.y) / 2 - visual.routeLabelFontSize * 0.6}
            className="edge-id"
            style={{ fontSize: visual.routeLabelFontSize }}
          >
            {step.edge.id}
          </text>
        ))}

        {debug.showRouteOrder && (!manualMode || showStitchDebugPoints) && visual.showRouteLabels && stitchRouteSteps.map((step, index) => (
          <g key={`order-${step.index}`}>
            <circle
              cx={(step.start.x + step.end.x) / 2}
              cy={(step.start.y + step.end.y) / 2 - visual.routeLabelFontSize}
              r={visual.routeLabelFontSize * 0.85}
              className="order-dot"
            />
            <text
              x={(step.start.x + step.end.x) / 2}
              y={(step.start.y + step.end.y) / 2 - visual.routeLabelFontSize * 0.72}
              className="order-label"
              style={{ fontSize: visual.routeLabelFontSize }}
            >
              {index + 1}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

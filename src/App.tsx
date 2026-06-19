import { useEffect, useMemo, useState } from "react";
import { DebugPanel } from "./components/DebugPanel";
import { ExportPanel } from "./components/ExportPanel";
import { ManualRoutingPanel } from "./components/ManualRoutingPanel";
import { ParametersPanel } from "./components/ParametersPanel";
import { PresetPanel } from "./components/PresetPanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { TrainingExamplesPanel } from "./components/TrainingExamplesPanel";
import { buildGraph } from "./engine/graphBuilder";
import { applyManualOverrides, buildTrainingExample, getConnectorEdges } from "./engine/manualRouting";
import { generatePattern } from "./engine/patternGenerator";
import { routeGraph } from "./engine/routingEngine";
import { createSvg } from "./engine/svgExporter";
import { cellKey, createCells, DEFAULT_GRID, getGridWarnings, resizeCells, setCellOrientation } from "./model/grid";
import type { DebugOptions, Edge, EditorViewState, GridConfig, ManualRouteOverride, PatternPrimitive, Point, Preset, RoutingTrainingExample, ThreadRouteProjectFile } from "./model/types";
import { deletePreset, loadPresets, savePreset } from "./storage/presets";
import { downloadText } from "./utils/download";

const initialKeys = new Set([
  cellKey(1, 2), cellKey(1, 7),
  cellKey(2, 1), cellKey(2, 3), cellKey(2, 6), cellKey(2, 8),
  cellKey(3, 1), cellKey(3, 4), cellKey(3, 5), cellKey(3, 8),
  cellKey(4, 2), cellKey(4, 7),
  cellKey(5, 3), cellKey(5, 6),
  cellKey(6, 4), cellKey(6, 5),
]);

const initialDebug: DebugOptions = {
  showGrid: true,
  showVertices: false,
  showEdgeIds: false,
  showStitchSegments: false,
  showConnectorSegments: true,
  showRouteOrder: false,
  showPatternOrder: false,
  showPatternOrientation: false,
  showConnectorLengths: false,
  showSharedVertices: false,
  showContactPoints: true,
  showRowGroups: false,
  showBlocks: false,
  showImageBounds: false,
  showConnectorCost: false,
  showCandidateConnectors: false,
  showContactPointGraph: false,
};

const loadTrainingExamples = (): RoutingTrainingExample[] => {
  try {
    return JSON.parse(localStorage.getItem("threadroute-training-examples") ?? "[]") as RoutingTrainingExample[];
  } catch {
    return [];
  }
};

const saveTrainingExamples = (examples: RoutingTrainingExample[]) => {
  localStorage.setItem("threadroute-training-examples", JSON.stringify(examples));
  return examples;
};

const autosaveKey = "threadroute-last-project";

const loadAutosavedProject = (): ThreadRouteProjectFile | null => {
  try {
    return JSON.parse(localStorage.getItem(autosaveKey) ?? "null") as ThreadRouteProjectFile | null;
  } catch {
    return null;
  }
};

const sanitizeProject = (project: Partial<ThreadRouteProjectFile>): ThreadRouteProjectFile | null => {
  if (!project.grid || !Array.isArray(project.cells) || !project.primitive) return null;
  return {
    version: "3.3",
    name: project.name,
    savedAt: project.savedAt ?? new Date().toISOString(),
    grid: project.grid,
    cells: project.cells,
    primitive: project.primitive,
    manualOverrides: Array.isArray(project.manualOverrides) ? project.manualOverrides : [],
    editor: {
      includeGrid: project.editor?.includeGrid ?? false,
      manualMode: project.editor?.manualMode ?? false,
      showStats: project.editor?.showStats ?? true,
      showManualConnectors: project.editor?.showManualConnectors ?? true,
      showOverriddenAutoConnectors: project.editor?.showOverriddenAutoConnectors ?? true,
      showStitchDebugPoints: project.editor?.showStitchDebugPoints ?? false,
      showManualPoints: project.editor?.showManualPoints ?? true,
      showSnapAreas: project.editor?.showSnapAreas ?? false,
      showHitAreas: project.editor?.showHitAreas ?? false,
      selectedConnectorId: project.editor?.selectedConnectorId ?? null,
      selectedPointIndex: project.editor?.selectedPointIndex ?? null,
      view: project.editor?.view ?? { zoom: 1, pan: { x: 0, y: 0 } },
    },
  };
};

export default function App() {
  const initialProject = useMemo(() => sanitizeProject(loadAutosavedProject() ?? {}), []);
  const [grid, setGrid] = useState<GridConfig>(initialProject?.grid ?? DEFAULT_GRID);
  const [cells, setCells] = useState(() => initialProject?.cells ?? createCells(DEFAULT_GRID, initialKeys));
  const [primitive, setPrimitive] = useState<PatternPrimitive>(initialProject?.primitive ?? {
    type: "alternatingDiagonal",
    repetitions: 1,
  });
  const [debug, setDebug] = useState(initialDebug);
  const [includeGrid, setIncludeGrid] = useState(initialProject?.editor.includeGrid ?? false);
  const [showStats, setShowStats] = useState(initialProject?.editor.showStats ?? true);
  const [presets, setPresets] = useState(loadPresets);
  const [manualMode, setManualMode] = useState(initialProject?.editor.manualMode ?? false);
  const [showManualConnectors, setShowManualConnectors] = useState(initialProject?.editor.showManualConnectors ?? true);
  const [showOverriddenAutoConnectors, setShowOverriddenAutoConnectors] = useState(initialProject?.editor.showOverriddenAutoConnectors ?? true);
  const [showStitchDebugPoints, setShowStitchDebugPoints] = useState(initialProject?.editor.showStitchDebugPoints ?? false);
  const [showManualPoints, setShowManualPoints] = useState(initialProject?.editor.showManualPoints ?? true);
  const [showSnapAreas, setShowSnapAreas] = useState(initialProject?.editor.showSnapAreas ?? false);
  const [showHitAreas, setShowHitAreas] = useState(initialProject?.editor.showHitAreas ?? false);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(initialProject?.editor.selectedConnectorId ?? null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(initialProject?.editor.selectedPointIndex ?? null);
  const [manualOverrides, setManualOverrides] = useState<ManualRouteOverride[]>(initialProject?.manualOverrides ?? []);
  const [viewState, setViewState] = useState<EditorViewState>(initialProject?.editor.view ?? { zoom: 1, pan: { x: 0, y: 0 } });
  const [trainingExamples, setTrainingExamples] = useState(loadTrainingExamples);
  const [trainingReason, setTrainingReason] = useState("");
  const [trainingUseful, setTrainingUseful] = useState(true);
  const [clearAllSignal, setClearAllSignal] = useState(0);
  const warnings = getGridWarnings(grid);
  const activeCellCount = useMemo(() => cells.filter((cell) => cell.enabled).length, [cells]);

  const { graph, automaticOutput } = useMemo(() => {
    const pattern = generatePattern(cells, grid, primitive);
    const nextGraph = buildGraph(pattern.geometry, primitive);
    return { graph: nextGraph, automaticOutput: routeGraph(nextGraph) };
  }, [cells, grid, primitive]);
  const { output, disconnected } = useMemo(
    () => applyManualOverrides(graph, automaticOutput, manualOverrides),
    [graph, automaticOutput, manualOverrides],
  );
  const selectedConnector = useMemo(
    () => getConnectorEdges(automaticOutput).find((edge) => edge.id === selectedConnectorId) ?? null,
    [automaticOutput, selectedConnectorId],
  );
  const currentOverride = manualOverrides.find((override) => override.connectorId === selectedConnectorId);

  const createProjectFile = (name?: string): ThreadRouteProjectFile => ({
    version: "3.3",
    name,
    savedAt: new Date().toISOString(),
    grid,
    cells,
    primitive,
    manualOverrides,
    editor: {
      includeGrid,
      manualMode,
      showStats,
      showManualConnectors,
      showOverriddenAutoConnectors,
      showStitchDebugPoints,
      showManualPoints,
      showSnapAreas,
      showHitAreas,
      selectedConnectorId,
      selectedPointIndex,
      view: viewState,
    },
  });

  const restoreProject = (project: ThreadRouteProjectFile) => {
    setGrid(project.grid);
    setCells(project.cells);
    setPrimitive(project.primitive);
    setManualOverrides(project.manualOverrides);
    setIncludeGrid(project.editor.includeGrid);
    setManualMode(project.editor.manualMode);
    setShowStats(project.editor.showStats);
    setShowManualConnectors(project.editor.showManualConnectors);
    setShowOverriddenAutoConnectors(project.editor.showOverriddenAutoConnectors);
    setShowStitchDebugPoints(project.editor.showStitchDebugPoints);
    setShowManualPoints(project.editor.showManualPoints);
    setShowSnapAreas(project.editor.showSnapAreas);
    setShowHitAreas(project.editor.showHitAreas);
    setSelectedConnectorId(project.editor.selectedConnectorId);
    setSelectedPointIndex(project.editor.selectedPointIndex);
    setViewState(project.editor.view);
  };

  useEffect(() => {
    localStorage.setItem(autosaveKey, JSON.stringify(createProjectFile("autosave")));
  }, [
    grid,
    cells,
    primitive,
    manualOverrides,
    includeGrid,
    manualMode,
    showStats,
    showManualConnectors,
    showOverriddenAutoConnectors,
    showStitchDebugPoints,
    showManualPoints,
    showSnapAreas,
    showHitAreas,
    selectedConnectorId,
    selectedPointIndex,
    viewState,
  ]);

  const changeGrid = (nextGrid: GridConfig) => {
    setGrid(nextGrid);
    setCells((current) => resizeCells(current, nextGrid));
  };

  const resetManualEditor = () => {
    setManualOverrides([]);
    setSelectedConnectorId(null);
    setSelectedPointIndex(null);
    setManualMode(false);
    setShowManualConnectors(true);
    setShowOverriddenAutoConnectors(true);
    setShowStitchDebugPoints(false);
    setShowManualPoints(true);
    setShowSnapAreas(false);
    setShowHitAreas(false);
    setTrainingReason("");
    setTrainingUseful(true);
  };

  const clearDesign = () => {
    localStorage.removeItem(autosaveKey);
    setCells((current) => current.map((cell) => ({ ...cell, enabled: false, orientation: null })));
    resetManualEditor();
  };

  const clearAll = () => {
    localStorage.removeItem(autosaveKey);
    setGrid(DEFAULT_GRID);
    setCells(createCells(DEFAULT_GRID));
    setPrimitive({ type: "alternatingDiagonal", repetitions: 1 });
    setDebug(initialDebug);
    setIncludeGrid(false);
    setShowStats(true);
    setViewState({ zoom: 1, pan: { x: 0, y: 0 } });
    resetManualEditor();
    setClearAllSignal((current) => current + 1);
  };

  const loadPreset = (preset: Preset) => {
    setGrid(preset.grid);
    setCells(preset.cells);
    setPrimitive(preset.primitive);
    resetManualEditor();
  };

  const createOverrideForConnector = (connector: Edge, points: Point[] = []): ManualRouteOverride => {
    const now = new Date().toISOString();
    return {
      id: `override-${Date.now()}`,
      connectorId: connector.id,
      originalStart: graph.vertices[connector.startVertex],
      originalEnd: graph.vertices[connector.endVertex],
      points,
      type: "manualConnector",
      createdAt: now,
      updatedAt: now,
    };
  };

  const upsertOverride = (override: ManualRouteOverride) => {
    setManualOverrides((current) => {
      const next = current.filter((item) => item.connectorId !== override.connectorId);
      return [...next, { ...override, updatedAt: new Date().toISOString() }];
    });
  };

  const selectConnector = (connectorId: string) => {
    setSelectedConnectorId(connectorId);
    setSelectedPointIndex(null);
  };

  const addManualPoint = (point: Point) => {
    if (!manualMode || !selectedConnector) return;
    const existing = manualOverrides.find((override) => override.connectorId === selectedConnector.id);
    const override = existing ?? createOverrideForConnector(selectedConnector);
    upsertOverride({ ...override, points: [...override.points, point] });
  };

  const moveManualPoint = (connectorId: string, pointIndex: number, point: Point) => {
    setManualOverrides((current) => current.map((override) =>
      override.connectorId === connectorId
        ? {
            ...override,
            points: override.points.map((currentPoint, index) => index === pointIndex ? point : currentPoint),
            updatedAt: new Date().toISOString(),
          }
        : override,
    ));
  };

  const removeSelectedPoint = () => {
    if (!selectedConnectorId || selectedPointIndex === null) return;
    setManualOverrides((current) => current.map((override) =>
      override.connectorId === selectedConnectorId
        ? {
            ...override,
            points: override.points.filter((_, index) => index !== selectedPointIndex),
            updatedAt: new Date().toISOString(),
          }
        : override,
    ));
    setSelectedPointIndex(null);
  };

  const setOverrideType = (type: ManualRouteOverride["type"]) => {
    if (!currentOverride) return;
    upsertOverride({ ...currentOverride, type });
  };

  const saveCurrentTrainingExample = () => {
    if (!selectedConnector || !currentOverride) return;
    const example = buildTrainingExample({
      grid,
      cells,
      graph,
      output: automaticOutput,
      automaticConnector: selectedConnector,
      manualOverride: currentOverride,
      reason: trainingReason.trim() || undefined,
      useful: trainingUseful,
    });
    setTrainingExamples((current) => saveTrainingExamples([...current, example]));
  };

  const importTrainingExamples = async (file: File) => {
    const text = await file.text();
    const imported = JSON.parse(text) as RoutingTrainingExample[];
    setTrainingExamples((current) => saveTrainingExamples([...current, ...imported]));
  };

  const openProject = async (file: File) => {
    try {
      const text = await file.text();
      const project = sanitizeProject(JSON.parse(text) as Partial<ThreadRouteProjectFile>);
      if (!project) return;
      restoreProject(project);
    } catch {
      return;
    }
  };

  return (
    <div className="app-shell">
      <ParametersPanel
        grid={grid}
        primitive={primitive}
        debug={debug}
        onGridChange={changeGrid}
        onPrimitiveChange={setPrimitive}
        onDebugChange={setDebug}
        onClearDesign={clearDesign}
        onClearAll={clearAll}
        onFill={() => setCells((current) => current.map((cell) => ({ ...cell, enabled: true, orientation: "diagonalDown" })))}
        warnings={warnings}
      />
      <aside className="sidebar extension-sidebar">
        <ManualRoutingPanel
          enabled={manualMode}
          selectedConnectorId={selectedConnectorId}
          selectedPointIndex={selectedPointIndex}
          currentOverride={currentOverride}
          disconnectedCount={disconnected.length}
          showManualConnectors={showManualConnectors}
          showOverriddenAutoConnectors={showOverriddenAutoConnectors}
          showStitchDebugPoints={showStitchDebugPoints}
          showManualPoints={showManualPoints}
          showSnapAreas={showSnapAreas}
          showHitAreas={showHitAreas}
          onEnabledChange={setManualMode}
          onRemovePoint={removeSelectedPoint}
          onResetConnector={() => {
            setManualOverrides((current) => current.filter((override) => override.connectorId !== selectedConnectorId));
            setSelectedPointIndex(null);
          }}
          onApply={() => {
            if (selectedConnector && !currentOverride) upsertOverride(createOverrideForConnector(selectedConnector));
          }}
          onTypeChange={setOverrideType}
          onShowManualConnectorsChange={setShowManualConnectors}
          onShowOverriddenAutoConnectorsChange={setShowOverriddenAutoConnectors}
          onShowStitchDebugPointsChange={setShowStitchDebugPoints}
          onShowManualPointsChange={setShowManualPoints}
          onShowSnapAreasChange={setShowSnapAreas}
          onShowHitAreasChange={setShowHitAreas}
        />
        <TrainingExamplesPanel
          examples={trainingExamples}
          reason={trainingReason}
          useful={trainingUseful}
          canSave={Boolean(selectedConnector && currentOverride)}
          onReasonChange={setTrainingReason}
          onUsefulChange={setTrainingUseful}
          onSave={saveCurrentTrainingExample}
          onExport={() => downloadText("threadroute-training-examples.json", JSON.stringify(trainingExamples, null, 2))}
          onImport={importTrainingExamples}
          onClear={() => setTrainingExamples(saveTrainingExamples([]))}
        />
      </aside>

      <main className={`workspace ${showStats ? "" : "stats-hidden"}`}>
        <header className="topbar">
          <div>
            <span className="eyebrow">Graph-first embroidery routing</span>
            <h1>Grid stitch path designer</h1>
          </div>
          <ExportPanel
            includeGrid={includeGrid}
            onIncludeGridChange={setIncludeGrid}
            onExport={() => downloadText("embroidery-grid-pattern.svg", createSvg(output, grid, cells, includeGrid))}
            onSaveProject={() => downloadText("threadroute-project.json", JSON.stringify(createProjectFile("ThreadRoute project"), null, 2))}
            onOpenProject={openProject}
          />
        </header>

        <div className="stats-toggle-row">
          <button className="secondary-button" type="button" onClick={() => setShowStats((current) => !current)}>
            {showStats ? "Hide stats" : "Show stats"}
          </button>
        </div>

        {showStats && <DebugPanel graph={graph} output={output} activeCells={activeCellCount} />}

        <PreviewCanvas
          cells={cells}
          grid={grid}
          graph={graph}
          output={output}
          debug={debug}
          manualMode={manualMode}
          selectedConnectorId={selectedConnectorId}
          selectedPointIndex={selectedPointIndex}
          manualOverrides={manualOverrides}
          showManualConnectors={showManualConnectors}
          showOverriddenAutoConnectors={showOverriddenAutoConnectors}
          showStitchDebugPoints={showStitchDebugPoints}
          showManualPoints={showManualPoints}
          showSnapAreas={showSnapAreas}
          showHitAreas={showHitAreas}
          viewState={viewState}
          clearAllSignal={clearAllSignal}
          onViewStateChange={setViewState}
          onSelectConnector={selectConnector}
          onAddManualPoint={addManualPoint}
          onSelectManualPoint={(connectorId, pointIndex) => {
            setSelectedConnectorId(connectorId);
            setSelectedPointIndex(pointIndex);
          }}
          onMoveManualPoint={moveManualPoint}
          onRemoveSelectedManualPoint={removeSelectedPoint}
          onClearManualSelection={() => {
            if (selectedPointIndex !== null) {
              setSelectedPointIndex(null);
            } else {
              setSelectedConnectorId(null);
            }
          }}
          onSetOrientation={(row, col, orientation) =>
            setCells((current) => setCellOrientation(current, row, col, orientation))
          }
        />

        <PresetPanel
          presets={presets}
          onSave={(name) => setPresets(savePreset(name, { grid, cells, primitive }))}
          onLoad={loadPreset}
          onDelete={(id) => setPresets(deletePreset(id))}
        />
      </main>
    </div>
  );
}

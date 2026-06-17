export interface GridConfig {
  rows: number;
  columns: number;
  cellWidth: number;
  cellHeight: number;
  gapX: number;
  gapY: number;
}

export interface Cell {
  row: number;
  col: number;
  enabled: boolean;
  orientation: CellDiagonal | null;
}

export type PatternPrimitiveType = "alternatingDiagonal" | (string & {});

export interface PatternPrimitive {
  type: PatternPrimitiveType;
  repetitions: number;
}

export type CellCorner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export interface Point {
  x: number;
  y: number;
}

export interface CellGeometry {
  cell: Cell;
  vertices: Record<CellCorner, Point>;
}

export interface OrientedCellGeometry extends CellGeometry {
  orientation: CellDiagonal;
  patternOrder: number;
}

export interface Vertex extends Point {
  id: string;
}

export interface ContactPoint {
  id: string;
  vertexId: string;
  edgeIds: string[];
  row: number;
  leftCol: number;
}

export interface ContactPointGraphEdge {
  id: string;
  startContactPointId: string;
  endContactPointId: string;
  startVertex: string;
  endVertex: string;
  length: number;
  kind: "verticalChain" | "blockContact" | "retraceReachable";
}

export interface ContactPointGraph {
  nodes: ContactPoint[];
  edges: ContactPointGraphEdge[];
}

export interface RowGroup {
  row: number;
  edgeIds: string[];
  direction: "leftToRight" | "rightToLeft";
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ConnectedBlock {
  id: string;
  edgeIds: string[];
  boundingBox: BoundingBox;
  entryCandidates: string[];
  exitCandidates: string[];
  rows: number[];
  columns: number[];
  order?: number;
  entryVertex?: string;
  exitVertex?: string;
}

export type CellDiagonal = "diagonalDown" | "diagonalUp";

export type EdgeType =
  | "stitch"
  | "visibleConnector"
  | "coveredConnector"
  | "contactConnector"
  | "verticalVertexConnector"
  | "lShapeConnector"
  | "retraceConnector"
  | "manualConnector"
  | "manualRetraceConnector";

export interface Edge {
  id: string;
  startVertex: string;
  endVertex: string;
  type: EdgeType;
  cellKey?: string;
  repetition?: number;
  sequence?: number;
  orientation?: CellDiagonal;
  patternOrder?: number;
  cellRow?: number;
  cellCol?: number;
  connectorRole?: "internalRow" | "rowChange" | "contact" | "blockChange" | "verticalVertex" | "lShape" | "retrace";
  cost?: number;
  candidateReason?: string;
}

export interface ConnectorCandidate {
  id: string;
  edges: Edge[];
  length: number;
  directionChanges: number;
  isDiagonal: boolean;
  horizontalLength: number;
  isFreeHorizontal: boolean;
  throughBlockHorizontal: boolean;
  usesContactPointChain: boolean;
  usesRetraceToContactPoint: boolean;
  crossesEmptyArea: number;
  goesOutsideBlock: boolean;
  returnsBackward: boolean;
  connectorType: EdgeType;
  cost: number;
}

export interface VertexGraph {
  vertices: Record<string, Vertex>;
  stitchEdges: Edge[];
  contactPoints?: Record<string, ContactPoint>;
  sharedVertexIds?: string[];
  rowGroups?: RowGroup[];
  blocks?: ConnectedBlock[];
}

export interface RouteStep {
  index: number;
  edge: Edge;
  start: Vertex;
  end: Vertex;
  length: number;
}

export interface RouteMetrics {
  connectorCount: number;
  totalConnectorLength: number;
  averageConnectorLength: number;
  longestConnector: number;
  routeLength: number;
  score: number;
  rowGroupCount: number;
  rowChangeConnectorCount: number;
  internalRowConnectorCount: number;
  blockCount: number;
  blockConnectorCount: number;
  internalBlockConnectorCount: number;
  verticalVertexConnectorCount: number;
  contactConnectorCount: number;
  lShapeConnectorCount: number;
  retraceConnectorCount: number;
  externalConnectorCount: number;
  outsideBlockConnectorCount: number;
  internalConnectorCount: number;
  horizontalConnectorCount: number;
  horizontalConnectorLength: number;
  contactPointChainStepCount: number;
  retraceToContactPointStepCount: number;
  avoidedHorizontalConnectorCount: number;
}

export interface EngineOutput {
  stitchEdges: Edge[];
  visibleConnectorEdges: Edge[];
  coveredConnectorEdges: Edge[];
  contactConnectorEdges: Edge[];
  verticalVertexConnectorEdges: Edge[];
  lShapeConnectorEdges: Edge[];
  retraceConnectorEdges: Edge[];
  manualConnectorEdges: Edge[];
  manualRetraceConnectorEdges: Edge[];
  connectorCandidates: ConnectorCandidate[];
  contactPointGraph: ContactPointGraph;
  blocks: ConnectedBlock[];
  routeVertices: Vertex[];
  routeSteps: RouteStep[];
  finalPath: string;
  metrics: RouteMetrics;
}

export interface ManualRouteOverride {
  id: string;
  connectorId: string;
  originalStart: Point;
  originalEnd: Point;
  points: Point[];
  type: "manualConnector" | "manualRetraceConnector";
  createdAt: string;
  updatedAt: string;
}

export interface RoutingTrainingExample {
  id: string;
  gridConfig: GridConfig;
  activeCells: Cell[];
  stitchEdges: Edge[];
  automaticConnector: Edge;
  manualOverride: ManualRouteOverride;
  localBlockContext: {
    blockId: string;
    nearbyEdges: Edge[];
    nearbyContactPoints: Point[];
    boundingBox: BoundingBox;
  };
  metricsBefore: {
    connectorLength: number;
    connectorType: string;
    crossesEmptyArea: boolean;
    outsideBlock: boolean;
  };
  metricsAfter: {
    connectorLength: number;
    connectorType: string;
    pointCount: number;
    usesRetrace: boolean;
  };
  reason?: string;
  useful?: boolean;
  createdAt: string;
}

export interface EditorViewState {
  zoom: number;
  pan: Point;
}

export interface ThreadRouteProjectFile {
  version: "3.2";
  name?: string;
  savedAt: string;
  grid: GridConfig;
  cells: Cell[];
  primitive: PatternPrimitive;
  manualOverrides: ManualRouteOverride[];
  editor: {
    includeGrid: boolean;
    manualMode: boolean;
    showStats: boolean;
    showManualConnectors: boolean;
    showStitchDebugPoints: boolean;
    showManualPoints: boolean;
    showSnapAreas: boolean;
    showHitAreas: boolean;
    selectedConnectorId: string | null;
    selectedPointIndex: number | null;
    view: EditorViewState;
  };
}

export interface DebugOptions {
  showGrid: boolean;
  showVertices: boolean;
  showEdgeIds: boolean;
  showStitchSegments: boolean;
  showConnectorSegments: boolean;
  showRouteOrder: boolean;
  showPatternOrder: boolean;
  showPatternOrientation: boolean;
  showConnectorLengths: boolean;
  showSharedVertices: boolean;
  showContactPoints: boolean;
  showRowGroups: boolean;
  showBlocks: boolean;
  showImageBounds: boolean;
  showConnectorCost: boolean;
  showCandidateConnectors: boolean;
  showContactPointGraph: boolean;
}

export interface ProjectState {
  grid: GridConfig;
  cells: Cell[];
  primitive: PatternPrimitive;
}

export interface Preset extends ProjectState {
  id: string;
  name: string;
  createdAt: string;
}

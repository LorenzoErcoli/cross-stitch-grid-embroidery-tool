import type {
  BoundingBox,
  Cell,
  Edge,
  EngineOutput,
  GridConfig,
  ManualRouteOverride,
  Point,
  RouteStep,
  RoutingTrainingExample,
  Vertex,
  VertexGraph,
} from "../model/types";

const EPSILON = 0.001;

const connectorTypes = new Set<Edge["type"]>([
  "visibleConnector",
  "coveredConnector",
  "contactConnector",
  "verticalVertexConnector",
  "lShapeConnector",
  "retraceConnector",
  "manualConnector",
  "manualRetraceConnector",
]);

export const isConnectorEdge = (edge: Edge) => connectorTypes.has(edge.type);

export function getConnectorEdges(output: EngineOutput): Edge[] {
  return [
    ...output.visibleConnectorEdges,
    ...output.coveredConnectorEdges,
    ...output.contactConnectorEdges,
    ...output.verticalVertexConnectorEdges,
    ...output.lShapeConnectorEdges,
    ...output.retraceConnectorEdges,
    ...output.manualConnectorEdges,
    ...output.manualRetraceConnectorEdges,
  ];
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function samePoint(a: Point, b: Point): boolean {
  return distance(a, b) <= EPSILON;
}

function vertexForPoint(graph: VertexGraph, id: string, point: Point): string {
  const rounded = { x: Number(point.x.toFixed(4)), y: Number(point.y.toFixed(4)) };
  const existing = Object.values(graph.vertices).find((vertex) => samePoint(vertex, rounded));
  if (existing) return existing.id;
  graph.vertices[id] = { id, ...rounded };
  return id;
}

function edgeLength(graph: VertexGraph, edge: Edge): number {
  const start = graph.vertices[edge.startVertex];
  const end = graph.vertices[edge.endVertex];
  return start && end ? distance(start, end) : 0;
}

function buildManualEdges(graph: VertexGraph, original: Edge, override: ManualRouteOverride): Edge[] {
  const points = [override.originalStart, ...override.points, override.originalEnd];
  const vertexIds = points.map((point, index) =>
    index === 0
      ? original.startVertex
      : index === points.length - 1
        ? original.endVertex
        : vertexForPoint(graph, `manual:${override.id}:${index}`, point),
  );

  return vertexIds.slice(0, -1).map((startVertex, index) => ({
    ...original,
    id: `${override.type === "manualRetraceConnector" ? "mrt" : "mc"}-${override.connectorId}-${index}`,
    startVertex,
    endVertex: vertexIds[index + 1],
    type: override.type,
    candidateReason: `manual:${override.id}`,
  })).filter((edge) => edgeLength(graph, edge) > EPSILON);
}

function rebuildRoute(output: EngineOutput, graph: VertexGraph): Pick<EngineOutput, "routeVertices" | "routeSteps" | "finalPath" | "metrics"> {
  const routeVertices: Vertex[] = [];
  const routeSteps: RouteStep[] = [];
  let routeLength = 0;

  for (const step of output.routeSteps) {
    const start = graph.vertices[step.edge.startVertex];
    const end = graph.vertices[step.edge.endVertex];
    if (!start || !end) continue;
    const length = distance(start, end);
    if (length <= EPSILON) continue;
    if (routeVertices.length === 0) routeVertices.push(start);
    routeVertices.push(end);
    routeSteps.push({ index: routeSteps.length + 1, edge: step.edge, start, end, length });
    routeLength += length;
  }

  const connectorLengths = routeSteps.filter((step) => isConnectorEdge(step.edge)).map((step) => step.length);
  const totalConnectorLength = connectorLengths.reduce((sum, length) => sum + length, 0);
  const finalPath = routeVertices.length === 0
    ? ""
    : routeVertices.map((vertex, index) => `${index === 0 ? "M" : "L"} ${vertex.x} ${vertex.y}`).join(" ");

  return {
    routeVertices,
    routeSteps,
    finalPath,
    metrics: {
      ...output.metrics,
      connectorCount: connectorLengths.length,
      totalConnectorLength,
      averageConnectorLength: connectorLengths.length ? totalConnectorLength / connectorLengths.length : 0,
      longestConnector: Math.max(0, ...connectorLengths),
      routeLength,
      retraceConnectorCount: output.retraceConnectorEdges.length + output.manualRetraceConnectorEdges.length,
    },
  };
}

export function applyManualOverrides(
  graph: VertexGraph,
  output: EngineOutput,
  overrides: ManualRouteOverride[],
): { output: EngineOutput; disconnected: ManualRouteOverride[] } {
  const connectorById = new Map(getConnectorEdges(output).map((edge) => [edge.id, edge]));
  const overrideByConnector = new Map<string, ManualRouteOverride>();
  const disconnected: ManualRouteOverride[] = [];

  for (const override of overrides) {
    const connector = connectorById.get(override.connectorId);
    if (connector) {
      overrideByConnector.set(override.connectorId, override);
      continue;
    }

    const compatible = getConnectorEdges(output).find((edge) => {
      const start = graph.vertices[edge.startVertex];
      const end = graph.vertices[edge.endVertex];
      return start && end && samePoint(start, override.originalStart) && samePoint(end, override.originalEnd);
    });
    if (compatible) overrideByConnector.set(compatible.id, { ...override, connectorId: compatible.id });
    else disconnected.push(override);
  }

  const manualConnectorEdges: Edge[] = [];
  const manualRetraceConnectorEdges: Edge[] = [];
  const nextRouteSteps: RouteStep[] = [];

  for (const step of output.routeSteps) {
    const override = overrideByConnector.get(step.edge.id);
    if (!override || !isConnectorEdge(step.edge)) {
      nextRouteSteps.push(step);
      continue;
    }

    const manualEdges = buildManualEdges(graph, step.edge, override);
    for (const edge of manualEdges) {
      if (edge.type === "manualRetraceConnector") manualRetraceConnectorEdges.push(edge);
      else manualConnectorEdges.push(edge);
      nextRouteSteps.push({ ...step, edge });
    }
  }

  const nextOutput: EngineOutput = {
    ...output,
    routeSteps: nextRouteSteps,
    manualConnectorEdges,
    manualRetraceConnectorEdges,
  };

  return { output: { ...nextOutput, ...rebuildRoute(nextOutput, graph) }, disconnected };
}

function boundsAround(points: Point[], padding = 20): BoundingBox {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
}

export function buildTrainingExample(args: {
  grid: GridConfig;
  cells: Cell[];
  graph: VertexGraph;
  output: EngineOutput;
  automaticConnector: Edge;
  manualOverride: ManualRouteOverride;
  reason?: string;
  useful?: boolean;
}): RoutingTrainingExample {
  const { grid, cells, graph, output, automaticConnector, manualOverride, reason, useful } = args;
  const start = graph.vertices[automaticConnector.startVertex];
  const end = graph.vertices[automaticConnector.endVertex];
  const contextBox = boundsAround([start, end, ...manualOverride.points]);
  const inBox = (point: Point) =>
    point.x >= contextBox.x
    && point.x <= contextBox.x + contextBox.width
    && point.y >= contextBox.y
    && point.y <= contextBox.y + contextBox.height;
  const nearbyEdges = output.stitchEdges.filter((edge) => {
    const edgeStart = graph.vertices[edge.startVertex];
    const edgeEnd = graph.vertices[edge.endVertex];
    return inBox(edgeStart) || inBox(edgeEnd);
  });
  const nearbyContactPoints = Object.values(graph.contactPoints ?? {})
    .map((point) => graph.vertices[point.vertexId])
    .filter(Boolean)
    .filter(inBox)
    .map(({ x, y }) => ({ x, y }));
  const block = output.blocks.find((candidate) => nearbyEdges.some((edge) => candidate.edgeIds.includes(edge.id)));
  const manualPoints = [manualOverride.originalStart, ...manualOverride.points, manualOverride.originalEnd];
  const manualLength = manualPoints.slice(0, -1).reduce((sum, point, index) => sum + distance(point, manualPoints[index + 1]), 0);

  return {
    id: `training-${Date.now()}`,
    gridConfig: grid,
    activeCells: cells.filter((cell) => cell.enabled),
    stitchEdges: output.stitchEdges,
    automaticConnector,
    manualOverride,
    localBlockContext: {
      blockId: block?.id ?? "unassigned",
      nearbyEdges,
      nearbyContactPoints,
      boundingBox: block?.boundingBox ?? contextBox,
    },
    metricsBefore: {
      connectorLength: edgeLength(graph, automaticConnector),
      connectorType: automaticConnector.type,
      crossesEmptyArea: automaticConnector.type === "visibleConnector" || automaticConnector.type === "lShapeConnector",
      outsideBlock: automaticConnector.connectorRole === "blockChange",
    },
    metricsAfter: {
      connectorLength: manualLength,
      connectorType: manualOverride.type,
      pointCount: manualOverride.points.length,
      usesRetrace: manualOverride.type === "manualRetraceConnector",
    },
    reason,
    useful,
    createdAt: new Date().toISOString(),
  };
}

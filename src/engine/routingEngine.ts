import { getVertex } from "../model/graph";
import type { ConnectedBlock, ContactPointGraph, ConnectorCandidate, Edge, EngineOutput, RouteMetrics, RouteStep, Vertex, VertexGraph } from "../model/types";

export const EPSILON_MM = 0.001;

const distance = (start: Vertex, end: Vertex) => Math.hypot(end.x - start.x, end.y - start.y);

function edgeLength(graph: VertexGraph, edge: Edge): number {
  return distance(getVertex(graph, edge.startVertex), getVertex(graph, edge.endVertex));
}

function ensureVertex(graph: VertexGraph, x: number, y: number): string {
  const roundedX = Number(x.toFixed(4));
  const roundedY = Number(y.toFixed(4));
  const id = `connector:${roundedX}:${roundedY}`;
  graph.vertices[id] ??= { id, x: roundedX, y: roundedY };
  return id;
}

function isZeroLength(graph: VertexGraph, edge: Edge): boolean {
  return edgeLength(graph, edge) <= EPSILON_MM;
}

function sameCoordinate(start: Vertex, end: Vertex): boolean {
  return distance(start, end) <= EPSILON_MM;
}

function routeScore(connectorLengths: number[], routeLength: number): number {
  const totalConnectorLength = connectorLengths.reduce((sum, length) => sum + length, 0);
  const longestConnector = Math.max(0, ...connectorLengths);
  return connectorLengths.length * 1000
    + totalConnectorLength * 10
    + longestConnector * 50
    + routeLength;
}

function connectorCost(candidate: Omit<ConnectorCandidate, "cost">): number {
  const diagonalPenalty = candidate.isDiagonal ? Math.max(1, candidate.length * 0.75) : 0;
  const outsideBlockPenalty = candidate.goesOutsideBlock ? 20 : 0;
  const externalLConnectorPenalty = candidate.goesOutsideBlock && candidate.connectorType === "lShapeConnector" ? 15 : 0;
  const emptyAreaPenalty = Math.max(0, candidate.crossesEmptyArea) * 5;
  const horizontalConnectorPenalty = candidate.isFreeHorizontal && candidate.horizontalLength > EPSILON_MM ? 25 : 0;
  const horizontalEmptyPenalty = candidate.isFreeHorizontal ? Math.max(0, candidate.crossesEmptyArea) * 10 : 0;
  const throughBlockHorizontalPenalty = candidate.throughBlockHorizontal ? 20 : 0;
  const backwardPenalty = candidate.returnsBackward ? 2 : 0;
  const retracePenalty = candidate.connectorType === "retraceConnector" ? 0.1 : 0;
  const coveredConnectorPenalty = candidate.connectorType === "coveredConnector" ? 0.2 : 0;
  const contactPointBonus = candidate.connectorType === "contactConnector" ? -14 : 0;
  const contactPointChainBonus = candidate.usesContactPointChain ? -18 : 0;
  const retraceToContactPointBonus = candidate.usesRetraceToContactPoint ? -12 : 0;
  return candidate.length
    + candidate.directionChanges * 0.5
    + diagonalPenalty
    + outsideBlockPenalty
    + externalLConnectorPenalty
    + emptyAreaPenalty
    + horizontalConnectorPenalty
    + horizontalEmptyPenalty
    + throughBlockHorizontalPenalty
    + backwardPenalty
    + retracePenalty
    + coveredConnectorPenalty
    + contactPointBonus
    + contactPointChainBonus
    + retraceToContactPointBonus
    + candidate.horizontalLength * (candidate.isFreeHorizontal ? 0.35 : 0);
}

function makeCandidate(candidate: Omit<ConnectorCandidate, "cost">): ConnectorCandidate {
  return { ...candidate, cost: connectorCost(candidate) };
}

function edgeCandidateLength(graph: VertexGraph, edges: Edge[]): number {
  return edges.reduce((sum, edge) => sum + edgeLength(graph, edge), 0);
}

function crossesEmptyCells(length: number, graph: VertexGraph): number {
  const rows = graph.stitchEdges.map((edge) => edge.cellRow).filter((row): row is number => row !== undefined);
  const cols = graph.stitchEdges.map((edge) => edge.cellCol).filter((col): col is number => col !== undefined);
  const rowSpan = rows.length ? Math.max(...rows) - Math.min(...rows) + 1 : 1;
  const colSpan = cols.length ? Math.max(...cols) - Math.min(...cols) + 1 : 1;
  const roughCell = Math.max(1, Math.min(
    ...graph.stitchEdges.flatMap((edge) => {
      const start = getVertex(graph, edge.startVertex);
      const end = getVertex(graph, edge.endVertex);
      return [Math.abs(end.x - start.x) || Number.POSITIVE_INFINITY, Math.abs(end.y - start.y) || Number.POSITIVE_INFINITY];
    }),
  ));
  const cells = length / roughCell;
  return Math.max(0, Math.floor(cells / 2) - Math.max(rowSpan, colSpan));
}

function estimateCellSize(graph: VertexGraph): number {
  const spans = graph.stitchEdges.flatMap((edge) => {
    const start = getVertex(graph, edge.startVertex);
    const end = getVertex(graph, edge.endVertex);
    return [Math.abs(end.x - start.x), Math.abs(end.y - start.y)].filter((value) => value > EPSILON_MM);
  });
  return Math.max(1, spans.length ? Math.min(...spans) : 1);
}

function isHorizontalEdge(graph: VertexGraph, edge: Edge): boolean {
  const start = getVertex(graph, edge.startVertex);
  const end = getVertex(graph, edge.endVertex);
  return Math.abs(start.y - end.y) <= EPSILON_MM && Math.abs(start.x - end.x) > EPSILON_MM;
}

function isVerticalEdge(graph: VertexGraph, edge: Edge): boolean {
  const start = getVertex(graph, edge.startVertex);
  const end = getVertex(graph, edge.endVertex);
  return Math.abs(start.x - end.x) <= EPSILON_MM && Math.abs(start.y - end.y) > EPSILON_MM;
}

function horizontalLength(graph: VertexGraph, edges: Edge[]): number {
  return edges.reduce((sum, edge) => isHorizontalEdge(graph, edge) ? sum + edgeLength(graph, edge) : sum, 0);
}

function isContactVertex(graph: VertexGraph, vertexId: string): boolean {
  return Object.values(graph.contactPoints ?? {}).some((point) => point.vertexId === vertexId);
}

function touchesContactPoint(graph: VertexGraph, edge: Edge): boolean {
  return isContactVertex(graph, edge.startVertex) || isContactVertex(graph, edge.endVertex);
}

function isFreeHorizontalEdge(graph: VertexGraph, edge: Edge): boolean {
  return isHorizontalEdge(graph, edge)
    && edge.type !== "retraceConnector"
    && edge.type !== "coveredConnector"
    && edge.type !== "contactConnector"
    && !findExistingEdgeBetween(graph, edge.startVertex, edge.endVertex);
}

function freeHorizontalLength(graph: VertexGraph, edges: Edge[]): number {
  return edges.reduce((sum, edge) => isFreeHorizontalEdge(graph, edge) ? sum + edgeLength(graph, edge) : sum, 0);
}

function hasThroughBlockHorizontal(graph: VertexGraph, edges: Edge[], block?: ConnectedBlock): boolean {
  if (!block) return false;
  const minX = block.boundingBox.x;
  const maxX = block.boundingBox.x + block.boundingBox.width;
  const minY = block.boundingBox.y;
  const maxY = block.boundingBox.y + block.boundingBox.height;
  return edges.some((edge) => {
    if (!isFreeHorizontalEdge(graph, edge)) return false;
    const start = getVertex(graph, edge.startVertex);
    const end = getVertex(graph, edge.endVertex);
    const yInside = start.y >= minY - EPSILON_MM && start.y <= maxY + EPSILON_MM;
    const crossesX = Math.max(start.x, end.x) >= minX - EPSILON_MM && Math.min(start.x, end.x) <= maxX + EPSILON_MM;
    return yInside && crossesX;
  });
}

function connectorMeta(graph: VertexGraph, edges: Edge[], block?: ConnectedBlock) {
  const horizontal = horizontalLength(graph, edges);
  const freeHorizontal = freeHorizontalLength(graph, edges);
  return {
    horizontalLength: horizontal,
    isFreeHorizontal: freeHorizontal > EPSILON_MM,
    throughBlockHorizontal: hasThroughBlockHorizontal(graph, edges, block),
    usesContactPointChain: edges.some((edge) => edge.type === "contactConnector" && isVerticalEdge(graph, edge)),
    usesRetraceToContactPoint: edges.some((edge) => edge.type === "retraceConnector" && touchesContactPoint(graph, edge)),
  };
}

function isOutsideBlock(edge: Edge, graph: VertexGraph, block?: ConnectedBlock): boolean {
  if (!block) return false;
  const start = getVertex(graph, edge.startVertex);
  const end = getVertex(graph, edge.endVertex);
  const margin = estimateCellSize(graph);
  const minX = block.boundingBox.x - margin;
  const maxX = block.boundingBox.x + block.boundingBox.width + margin;
  const minY = block.boundingBox.y - margin;
  const maxY = block.boundingBox.y + block.boundingBox.height + margin;
  return [start, end].some((vertex) => vertex.x < minX || vertex.x > maxX || vertex.y < minY || vertex.y > maxY);
}

function returnsBackward(current: Vertex, target: Vertex, previousStitch?: Edge): boolean {
  if (!previousStitch?.cellCol) return false;
  return target.x < current.x && previousStitch.cellCol >= 0;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function edgeVertices(edge: Edge): string[] {
  return [edge.startVertex, edge.endVertex];
}

function edgesAreBlockConnected(a: Edge, b: Edge, graph: VertexGraph): boolean {
  const sharedVertex = edgeVertices(a).some((vertexId) => b.startVertex === vertexId || b.endVertex === vertexId);
  if (sharedVertex) return true;

  const sharedContact = Object.values(graph.contactPoints ?? {}).some((point) =>
    point.edgeIds.includes(a.id) && point.edgeIds.includes(b.id),
  );
  if (sharedContact) return true;

  if (a.cellRow !== undefined && a.cellCol !== undefined && b.cellRow !== undefined && b.cellCol !== undefined) {
    const rowDelta = Math.abs(a.cellRow - b.cellRow);
    const colDelta = Math.abs(a.cellCol - b.cellCol);
    if ((rowDelta === 0 && colDelta <= 1) || (colDelta === 0 && rowDelta <= 1)) return true;
  }

  return edgeVertices(a).some((aVertexId) =>
    edgeVertices(b).some((bVertexId) => distance(getVertex(graph, aVertexId), getVertex(graph, bVertexId)) <= EPSILON_MM),
  );
}

export function detectConnectedBlocks(stitchEdges: Edge[], graph: VertexGraph): ConnectedBlock[] {
  const remaining = new Set(stitchEdges.map((edge) => edge.id));
  const edgeById = new Map(stitchEdges.map((edge) => [edge.id, edge]));
  const blocks: ConnectedBlock[] = [];

  while (remaining.size > 0) {
    const firstId = remaining.values().next().value as string;
    const queue = [firstId];
    const blockIds: string[] = [];
    remaining.delete(firstId);

    while (queue.length > 0) {
      const edgeId = queue.shift()!;
      const edge = edgeById.get(edgeId)!;
      blockIds.push(edgeId);

      for (const candidateId of [...remaining]) {
        const candidate = edgeById.get(candidateId)!;
        if (!edgesAreBlockConnected(edge, candidate, graph)) continue;
        remaining.delete(candidateId);
        queue.push(candidateId);
      }
    }

    const blockEdges = blockIds.map((id) => edgeById.get(id)!);
    const vertices = blockEdges.flatMap((edge) => edgeVertices(edge).map((vertexId) => getVertex(graph, vertexId)));
    const minX = Math.min(...vertices.map((vertex) => vertex.x));
    const maxX = Math.max(...vertices.map((vertex) => vertex.x));
    const minY = Math.min(...vertices.map((vertex) => vertex.y));
    const maxY = Math.max(...vertices.map((vertex) => vertex.y));
    const rows = unique(blockEdges.map((edge) => edge.cellRow).filter((row): row is number => row !== undefined)).sort((a, b) => a - b);
    const columns = unique(blockEdges.map((edge) => edge.cellCol).filter((col): col is number => col !== undefined)).sort((a, b) => a - b);
    blocks.push({
      id: `block-${blocks.length + 1}`,
      edgeIds: blockIds,
      boundingBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      entryCandidates: unique(blockEdges.map((edge) => edge.startVertex)),
      exitCandidates: unique(blockEdges.map((edge) => edge.endVertex)),
      rows,
      columns,
    });
  }

  return blocks.sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);
}

function contactPointsForEdge(edge: Edge, graph: VertexGraph) {
  return Object.values(graph.contactPoints ?? {}).filter((point) => point.edgeIds.includes(edge.id));
}

export function buildContactPointGraph(graph: VertexGraph): ContactPointGraph {
  const nodes = Object.values(graph.contactPoints ?? {});
  const edges: ContactPointGraph["edges"] = [];
  const cellSize = estimateCellSize(graph);
  const addEdge = (start: typeof nodes[number], end: typeof nodes[number], kind: ContactPointGraph["edges"][number]["kind"]) => {
    if (start.id === end.id) return;
    const duplicate = edges.some((edge) =>
      (edge.startContactPointId === start.id && edge.endContactPointId === end.id)
      || (edge.startContactPointId === end.id && edge.endContactPointId === start.id),
    );
    if (duplicate) return;
    const startVertex = getVertex(graph, start.vertexId);
    const endVertex = getVertex(graph, end.vertexId);
    edges.push({
      id: `cpg-${edges.length}`,
      startContactPointId: start.id,
      endContactPointId: end.id,
      startVertex: start.vertexId,
      endVertex: end.vertexId,
      length: distance(startVertex, endVertex),
      kind,
    });
  };

  const columns = new Map<number, typeof nodes>();
  for (const point of nodes) {
    const vertex = getVertex(graph, point.vertexId);
    const bucket = Math.round(vertex.x / Math.max(cellSize, EPSILON_MM));
    const values = columns.get(bucket) ?? [];
    values.push(point);
    columns.set(bucket, values);
  }

  for (const columnPoints of columns.values()) {
    const sorted = [...columnPoints].sort((a, b) => getVertex(graph, a.vertexId).y - getVertex(graph, b.vertexId).y);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const next = sorted[index];
      const previousVertex = getVertex(graph, previous.vertexId);
      const nextVertex = getVertex(graph, next.vertexId);
      if (Math.abs(previousVertex.x - nextVertex.x) <= cellSize * 0.35) addEdge(previous, next, "verticalChain");
    }
  }

  for (let a = 0; a < nodes.length; a += 1) {
    for (let b = a + 1; b < nodes.length; b += 1) {
      const aVertex = getVertex(graph, nodes[a].vertexId);
      const bVertex = getVertex(graph, nodes[b].vertexId);
      if (distance(aVertex, bVertex) <= cellSize * 1.5) addEdge(nodes[a], nodes[b], "blockContact");
      const retraceReachable = nodes[a].edgeIds.some((edgeId) => nodes[b].edgeIds.includes(edgeId))
        || graph.stitchEdges.some((edge) =>
          nodes[a].edgeIds.includes(edge.id) && nodes[b].edgeIds.includes(edge.id),
        );
      if (retraceReachable) addEdge(nodes[a], nodes[b], "retraceReachable");
    }
  }

  return { nodes, edges };
}

function pushNonZero(graph: VertexGraph, edges: Edge[], edge: Edge) {
  if (!isZeroLength(graph, edge)) edges.push(edge);
}

export function findContactPointConnector(
  currentEdge: Edge,
  nextEdge: Edge,
  graph: VertexGraph,
): Edge[] | undefined {
  let best: Edge[] | undefined;
  let bestLength = Number.POSITIVE_INFINITY;

  for (const currentPoint of contactPointsForEdge(currentEdge, graph)) {
    for (const nextPoint of contactPointsForEdge(nextEdge, graph)) {
      const currentVertex = getVertex(graph, currentPoint.vertexId);
      const nextVertex = getVertex(graph, nextPoint.vertexId);
      const samePoint = sameCoordinate(currentVertex, nextVertex);
      if (!samePoint && Math.abs(currentVertex.x - nextVertex.x) > EPSILON_MM) continue;

      const edges: Edge[] = [];
      if (currentEdge.endVertex !== currentPoint.vertexId) {
        pushNonZero(graph, edges, {
          id: "covered-contact-return",
          startVertex: currentEdge.endVertex,
          endVertex: currentPoint.vertexId,
          type: "coveredConnector",
          connectorRole: "contact",
        });
      }
      if (!samePoint) {
        pushNonZero(graph, edges, {
          id: "contact-draft",
          startVertex: currentPoint.vertexId,
          endVertex: nextPoint.vertexId,
          type: "contactConnector",
          connectorRole: "rowChange",
        });
      }
      if (nextPoint.vertexId !== nextEdge.startVertex) {
        pushNonZero(graph, edges, {
          id: "covered-contact-advance",
          startVertex: nextPoint.vertexId,
          endVertex: nextEdge.startVertex,
          type: "coveredConnector",
          connectorRole: "contact",
        });
      }

      if (edges.length === 0) continue;
      const length = edges.reduce((sum, edge) => sum + edgeLength(graph, edge), 0);
      if (length < bestLength) {
        bestLength = length;
        best = edges;
      }
    }
  }
  return best;
}

export function groupStitchEdgesByRow(graph: VertexGraph): Edge[][] {
  const edgeById = new Map(graph.stitchEdges.map((edge) => [edge.id, edge]));
  const explicitGroups = graph.rowGroups
    ?.map((group) => group.edgeIds.map((id) => edgeById.get(id)).filter((edge): edge is Edge => Boolean(edge)))
    .filter((group) => group.length > 0);
  if (explicitGroups?.length) return explicitGroups;

  const rows = new Map<number, Edge[]>();
  for (const edge of graph.stitchEdges) {
    if (edge.cellRow === undefined) return [graph.stitchEdges];
    const row = rows.get(edge.cellRow) ?? [];
    row.push(edge);
    rows.set(edge.cellRow, row);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, edges], index) =>
      [...edges].sort((a, b) => {
        const diff = (a.cellCol ?? 0) - (b.cellCol ?? 0);
        return index % 2 === 0 ? diff : -diff;
      }),
    );
}

function serpentineOrder(edges: Edge[]): Edge[] {
  const rows = new Map<number, Edge[]>();
  for (const edge of edges) {
    if (edge.cellRow === undefined) return [...edges];
    const row = rows.get(edge.cellRow) ?? [];
    row.push(edge);
    rows.set(edge.cellRow, row);
  }

  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, rowEdges], index) =>
      [...rowEdges].sort((a, b) => {
        const diff = (a.cellCol ?? 0) - (b.cellCol ?? 0);
        return index % 2 === 0 ? diff : -diff;
      }),
    );
}

function optimizeGreedyOrder(graph: VertexGraph, edges: Edge[]): Edge[] {
  if (edges.length <= 1) return [...edges];

  let bestOrder: Edge[] = [];
  let bestScore = Number.POSITIVE_INFINITY;
  const startCandidates = edges;

  for (const startingEdge of startCandidates) {
    const remaining = edges.filter((edge) => edge.id !== startingEdge.id);
    const order = [startingEdge];
    const connectorLengths: number[] = [];
    let routeLength = edgeLength(graph, startingEdge);
    let current = getVertex(graph, startingEdge.endVertex);
    let currentEdge = startingEdge;

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestPriority = Number.POSITIVE_INFINITY;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];
        const candidateStart = getVertex(graph, candidate.startVertex);
        const vertical = Math.abs(current.x - candidateStart.x) <= EPSILON_MM;
        const contactPath = findContactPointConnector(currentEdge, candidate, graph);
        const candidateDistance = vertical
          ? distance(current, candidateStart)
          : contactPath
            ? contactPath.reduce((sum, edge) => sum + edgeLength(graph, edge), 0)
            : distance(current, candidateStart);
        const candidatePriority = sameCoordinate(current, candidateStart)
          ? -1
          : vertical ? 0 : contactPath ? 1 : 2;
        if (candidatePriority < bestPriority || (candidatePriority === bestPriority && candidateDistance < bestDistance)) {
          bestPriority = candidatePriority;
          bestDistance = candidateDistance;
          bestIndex = index;
        }
      }
      const next = remaining.splice(bestIndex, 1)[0];
      connectorLengths.push(distance(current, getVertex(graph, next.startVertex)));
      routeLength += edgeLength(graph, next);
      order.push(next);
      current = getVertex(graph, next.endVertex);
      currentEdge = next;
    }

    const score = routeScore(connectorLengths, routeLength);
    if (score < bestScore) {
      bestScore = score;
      bestOrder = order;
    }
  }

  return bestOrder;
}

function blockInternalOrder(graph: VertexGraph, block: ConnectedBlock): Edge[] {
  const edgeById = new Map(graph.stitchEdges.map((edge) => [edge.id, edge]));
  const edges = block.edgeIds.map((id) => edgeById.get(id)).filter((edge): edge is Edge => Boolean(edge));
  if (edges.every((edge) => edge.cellRow !== undefined && edge.cellCol !== undefined)) return serpentineOrder(edges);
  return optimizeGreedyOrder(graph, edges);
}

function orderBlocks(graph: VertexGraph, blocks: ConnectedBlock[]): ConnectedBlock[] {
  if (blocks.length <= 1) return blocks.map((block, index) => ({ ...block, order: index + 1 }));

  const remaining = [...blocks];
  const ordered: ConnectedBlock[] = [];
  let current = remaining.shift()!;
  ordered.push(current);

  while (remaining.length > 0) {
    const currentExitVertices = current.exitCandidates.map((vertexId) => getVertex(graph, vertexId));
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const candidateEntries = candidate.entryCandidates.map((vertexId) => getVertex(graph, vertexId));
      const minDistance = Math.min(...currentExitVertices.flatMap((exit) =>
        candidateEntries.map((entry) => distance(exit, entry)),
      ));
      if (minDistance < bestDistance) {
        bestDistance = minDistance;
        bestIndex = index;
      }
    }
    current = remaining.splice(bestIndex, 1)[0];
    ordered.push(current);
  }

  return ordered.map((block, index) => ({ ...block, order: index + 1 }));
}

function optimizeOrder(graph: VertexGraph): { order: Edge[]; blocks: ConnectedBlock[] } {
  if (graph.stitchEdges.length === 0) return { order: [], blocks: [] };
  if (graph.stitchEdges.length === 1) {
    const blocks = detectConnectedBlocks(graph.stitchEdges, graph).map((block) => ({
      ...block,
      order: 1,
      entryVertex: graph.stitchEdges[0].startVertex,
      exitVertex: graph.stitchEdges[0].endVertex,
    }));
    return { order: [...graph.stitchEdges], blocks };
  }
  const detectedBlocks = orderBlocks(graph, graph.blocks?.length ? graph.blocks : detectConnectedBlocks(graph.stitchEdges, graph));
  const blockOrders = detectedBlocks.map((block) => blockInternalOrder(graph, block));
  const order = blockOrders.flat();
  const blocks = detectedBlocks.map((block, index) => ({
    ...block,
    entryVertex: blockOrders[index]?.[0]?.startVertex,
    exitVertex: blockOrders[index]?.[blockOrders[index].length - 1]?.endVertex,
  }));
  if (order.length === graph.stitchEdges.length) return { order, blocks };

  let bestOrder: Edge[] = [];
  let bestScore = Number.POSITIVE_INFINITY;
  let bestUsesContact = false;
  const edgeCount = graph.stitchEdges.length;
  const startCandidateCount = edgeCount <= 120 ? edgeCount : edgeCount <= 1000 ? 16 : 2;
  const startCandidates = startCandidateCount === edgeCount
    ? graph.stitchEdges
    : Array.from({ length: startCandidateCount }, (_, index) =>
        graph.stitchEdges[Math.round(index * (edgeCount - 1) / Math.max(1, startCandidateCount - 1))],
      );

  for (const startingEdge of startCandidates) {
    const remaining = graph.stitchEdges.filter((edge) => edge.id !== startingEdge.id);
    const order = [startingEdge];
    const connectorLengths: number[] = [];
    let routeLength = edgeLength(graph, startingEdge);
    let current = getVertex(graph, startingEdge.endVertex);
    let currentEdge = startingEdge;

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestPriority = Number.POSITIVE_INFINITY;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];
        const candidateStart = getVertex(graph, candidate.startVertex);
        const contactPath = findContactPointConnector(currentEdge, candidate, graph);
        const candidateDistance = contactPath
          ? contactPath.reduce((sum, edge) => sum + edgeLength(graph, edge), 0)
          : distance(current, candidateStart);
        const candidatePriority = current.id === candidateStart.id
          || sameCoordinate(current, candidateStart)
          ? -1
          : contactPath ? 0 : current.x === candidateStart.x ? 1 : 2;
        const bestPatternOrder = remaining[bestIndex]?.patternOrder ?? Number.POSITIVE_INFINITY;
        if (candidatePriority < bestPriority
          || (candidatePriority === bestPriority && candidateDistance < bestDistance)
          || (candidatePriority === bestPriority
            && candidateDistance === bestDistance
            && (candidate.patternOrder ?? 0) < bestPatternOrder)) {
          bestPriority = candidatePriority;
          bestDistance = candidateDistance;
          bestIndex = index;
        }
      }
      const next = remaining.splice(bestIndex, 1)[0];
      const contactPath = findContactPointConnector(currentEdge, next, graph);
      const transitionLengths = contactPath?.map((edge) => edgeLength(graph, edge))
        ?? [distance(current, getVertex(graph, next.startVertex))].filter((length) => length > 0);
      connectorLengths.push(...transitionLengths);
      routeLength += transitionLengths.reduce((sum, length) => sum + length, 0) + edgeLength(graph, next);
      order.push(next);
      current = getVertex(graph, next.endVertex);
      currentEdge = next;
    }

    const score = routeScore(connectorLengths, routeLength);
    const usesContact = order.slice(1).some((edge, index) =>
      findContactPointConnector(order[index], edge, graph),
    );
    if ((usesContact && !bestUsesContact) || (usesContact === bestUsesContact && score < bestScore)) {
      bestUsesContact = usesContact;
      bestScore = score;
      bestOrder = order;
    }
  }

  return { order: bestOrder, blocks };
}

function isCoveredConnector(connector: Edge, stitches: Edge[]): boolean {
  return stitches.some((edge) =>
    (edge.startVertex === connector.startVertex && edge.endVertex === connector.endVertex)
    || (edge.startVertex === connector.endVertex && edge.endVertex === connector.startVertex),
  );
}

function findExistingEdgeBetween(graph: VertexGraph, startVertex: string, endVertex: string): Edge | undefined {
  return graph.stitchEdges.find((edge) =>
    (edge.startVertex === startVertex && edge.endVertex === endVertex)
    || (edge.startVertex === endVertex && edge.endVertex === startVertex),
  );
}

function retracePathsFromCurrent(graph: VertexGraph, current: Vertex, target: Vertex, role: Edge["connectorRole"]): Edge[][] {
  const direct = findExistingEdgeBetween(graph, current.id, target.id);
  if (direct) {
    return [[{
      id: "retrace-direct",
      startVertex: current.id,
      endVertex: target.id,
      type: "retraceConnector",
      connectorRole: "retrace",
    }]];
  }

  const candidates: Edge[] = [];
  for (const stitch of graph.stitchEdges) {
    if (stitch.startVertex === current.id) {
      candidates.push({
        id: "retrace-out",
        startVertex: current.id,
        endVertex: stitch.endVertex,
        type: "retraceConnector",
        connectorRole: "retrace",
      });
    }
    if (stitch.endVertex === current.id) {
      candidates.push({
        id: "retrace-out",
        startVertex: current.id,
        endVertex: stitch.startVertex,
        type: "retraceConnector",
        connectorRole: "retrace",
      });
    }
  }

  return candidates
    .filter((edge) => !isZeroLength(graph, edge))
    .sort((a, b) => distance(getVertex(graph, a.endVertex), target) - distance(getVertex(graph, b.endVertex), target))
    .slice(0, 2)
    .flatMap((edge) => {
      const retrace = { ...edge, connectorRole: role === "blockChange" ? "blockChange" as const : "retrace" as const };
      const retraceEnd = getVertex(graph, retrace.endVertex);
      if (sameCoordinate(retraceEnd, target)) return [[retrace]];
      const vertical = findVerticalVertexConnector(retraceEnd, target, role);
      if (vertical) return [[retrace, vertical]];
      return buildLShapeEdges(graph, retraceEnd, target, role).slice(0, 1).map((path) => [retrace, ...path]);
    });
}

function classifyConnectorRole(previousStitch: Edge | undefined, nextStitch: Edge): Edge["connectorRole"] {
  if (!previousStitch) return "internalRow";
  return previousStitch.cellRow !== undefined
    && nextStitch.cellRow !== undefined
    && previousStitch.cellRow !== nextStitch.cellRow
    ? "rowChange"
    : "internalRow";
}

function findVerticalVertexConnector(current: Vertex, target: Vertex, role: Edge["connectorRole"]): Edge | undefined {
  if (Math.abs(current.x - target.x) > EPSILON_MM) return undefined;
  return {
    id: "vertical-vertex-draft",
    startVertex: current.id,
    endVertex: target.id,
    type: "verticalVertexConnector",
    connectorRole: role === "blockChange" ? "blockChange" : "verticalVertex",
  };
}

function buildLShapeEdges(graph: VertexGraph, current: Vertex, target: Vertex, role: Edge["connectorRole"]): Edge[][] {
  if (sameCoordinate(current, target)) return [];
  const horizontalFirstCorner = ensureVertex(graph, target.x, current.y);
  const verticalFirstCorner = ensureVertex(graph, current.x, target.y);
  const paths: Edge[][] = [];

  const horizontalFirstDrafts: Edge[] = [
    {
      id: "l-shape-h",
      startVertex: current.id,
      endVertex: horizontalFirstCorner,
      type: "lShapeConnector",
      connectorRole: role === "blockChange" ? "blockChange" : "lShape",
    },
    {
      id: "l-shape-v",
      startVertex: horizontalFirstCorner,
      endVertex: target.id,
      type: "lShapeConnector",
      connectorRole: role === "blockChange" ? "blockChange" : "lShape",
    },
  ];
  const horizontalFirst = horizontalFirstDrafts.filter((edge) => !isZeroLength(graph, edge));

  const verticalFirstDrafts: Edge[] = [
    {
      id: "l-shape-v",
      startVertex: current.id,
      endVertex: verticalFirstCorner,
      type: "lShapeConnector",
      connectorRole: role === "blockChange" ? "blockChange" : "lShape",
    },
    {
      id: "l-shape-h",
      startVertex: verticalFirstCorner,
      endVertex: target.id,
      type: "lShapeConnector",
      connectorRole: role === "blockChange" ? "blockChange" : "lShape",
    },
  ];
  const verticalFirst = verticalFirstDrafts.filter((edge) => !isZeroLength(graph, edge));

  if (horizontalFirst.length) paths.push(horizontalFirst);
  if (verticalFirst.length) paths.push(verticalFirst);
  return paths;
}

function buildConnectorCandidates(
  current: Vertex,
  target: Vertex,
  graph: VertexGraph,
  previousStitch: Edge | undefined,
  nextStitch: Edge,
  role: Edge["connectorRole"],
  block?: ConnectedBlock,
): ConnectorCandidate[] {
  const candidates: ConnectorCandidate[] = [];
  const vertical = findVerticalVertexConnector(current, target, role);
  if (vertical) {
    const length = edgeLength(graph, vertical);
    const meta = connectorMeta(graph, [vertical], block);
    candidates.push(makeCandidate({
      id: "candidate-vertical",
      edges: [vertical],
      length,
      directionChanges: 0,
      isDiagonal: false,
      ...meta,
      crossesEmptyArea: 0,
      goesOutsideBlock: isOutsideBlock(vertical, graph, block),
      returnsBackward: returnsBackward(current, target, previousStitch),
      connectorType: "verticalVertexConnector",
    }));
  }

  for (const [index, edges] of retracePathsFromCurrent(graph, current, target, role).entries()) {
    const length = edgeCandidateLength(graph, edges);
    const meta = connectorMeta(graph, edges, block);
    candidates.push(makeCandidate({
      id: `candidate-retrace-${index}`,
      edges,
      length,
      directionChanges: Math.max(0, edges.length - 1),
      isDiagonal: false,
      ...meta,
      crossesEmptyArea: Math.max(0, crossesEmptyCells(length, graph) - 1),
      goesOutsideBlock: edges.some((edge) => isOutsideBlock(edge, graph, block)),
      returnsBackward: false,
      connectorType: "retraceConnector",
    }));
  }

  for (const [index, edges] of buildLShapeEdges(graph, current, target, role).entries()) {
    const length = edgeCandidateLength(graph, edges);
    const meta = connectorMeta(graph, edges, block);
    const maxHorizontal = Math.max(1, ...graph.stitchEdges.map((edge) => {
      if (edge.cellCol === undefined) return 1;
      const start = getVertex(graph, edge.startVertex);
      const end = getVertex(graph, edge.endVertex);
      return Math.abs(end.x - start.x) * 3;
    }));
    candidates.push(makeCandidate({
      id: `candidate-l-${index}`,
      edges,
      length,
      directionChanges: edges.length > 1 ? 1 : 0,
      isDiagonal: false,
      ...meta,
      crossesEmptyArea: meta.horizontalLength > maxHorizontal ? crossesEmptyCells(length, graph) + 2 : crossesEmptyCells(length, graph),
      goesOutsideBlock: edges.some((edge) => isOutsideBlock(edge, graph, block)),
      returnsBackward: returnsBackward(current, target, previousStitch),
      connectorType: "lShapeConnector",
    }));
  }

  const contactPath = previousStitch ? findContactPointConnector(previousStitch, nextStitch, graph) : undefined;
  if (contactPath) {
    const length = edgeCandidateLength(graph, contactPath);
    const meta = connectorMeta(graph, contactPath, block);
    candidates.push(makeCandidate({
      id: "candidate-contact",
      edges: contactPath,
      length,
      directionChanges: Math.max(0, contactPath.length - 1),
      isDiagonal: false,
      ...meta,
      crossesEmptyArea: 0,
      goesOutsideBlock: contactPath.some((edge) => isOutsideBlock(edge, graph, block)),
      returnsBackward: returnsBackward(current, target, previousStitch),
      connectorType: "contactConnector",
    }));
  }

  const direct: Edge = {
    id: "candidate-visible-direct",
    startVertex: current.id,
    endVertex: target.id,
    type: findExistingEdgeBetween(graph, current.id, target.id)
      ? "retraceConnector"
      : "visibleConnector",
    connectorRole: role,
  };
  const directLength = edgeLength(graph, direct);
  if (directLength > EPSILON_MM) {
    const directStart = getVertex(graph, direct.startVertex);
    const directEnd = getVertex(graph, direct.endVertex);
    const meta = connectorMeta(graph, [direct], block);
    candidates.push(makeCandidate({
      id: "candidate-direct",
      edges: [direct],
      length: directLength,
      directionChanges: 0,
      isDiagonal: Math.abs(directStart.x - directEnd.x) > EPSILON_MM && Math.abs(directStart.y - directEnd.y) > EPSILON_MM,
      ...meta,
      crossesEmptyArea: crossesEmptyCells(directLength, graph),
      goesOutsideBlock: isOutsideBlock(direct, graph, block),
      returnsBackward: returnsBackward(current, target, previousStitch),
      connectorType: direct.type,
    }));
  }

  return candidates.sort((a, b) => a.cost - b.cost);
}

export function routeGraph(graph: VertexGraph): EngineOutput {
  const { order: optimizedStitches, blocks } = optimizeOrder(graph);
  const contactPointGraph = buildContactPointGraph(graph);
  const visibleConnectorEdges: Edge[] = [];
  const coveredConnectorEdges: Edge[] = [];
  const contactConnectorEdges: Edge[] = [];
  const verticalVertexConnectorEdges: Edge[] = [];
  const lShapeConnectorEdges: Edge[] = [];
  const retraceConnectorEdges: Edge[] = [];
  const connectorCandidates: ConnectorCandidate[] = [];
  const routeVertices: Vertex[] = [];
  const routeSteps: RouteStep[] = [];
  const connectorLengths: number[] = [];
  let routeLength = 0;
  let current: Vertex | undefined;
  let avoidedHorizontalConnectorCount = 0;

  const appendStep = (edge: Edge) => {
    const start = getVertex(graph, edge.startVertex);
    const end = getVertex(graph, edge.endVertex);
    const length = distance(start, end);
    if (length <= EPSILON_MM) return;
    if (routeVertices.length === 0) routeVertices.push(start);
    routeVertices.push(end);
    routeSteps.push({ index: routeSteps.length + 1, edge, start, end, length });
    routeLength += length;
    current = end;
  };

  optimizedStitches.forEach((stitch, index) => {
    const target = getVertex(graph, stitch.startVertex);
    if (current && !sameCoordinate(current, target)) {
      const previousStitch = optimizedStitches[index - 1];
      const previousBlock = blocks.find((block) => previousStitch && block.edgeIds.includes(previousStitch.id));
      const nextBlock = blocks.find((block) => block.edgeIds.includes(stitch.id));
      const connectorRole = previousBlock && nextBlock && previousBlock.id !== nextBlock.id
        ? "blockChange"
        : classifyConnectorRole(previousStitch, stitch);
      const candidates = buildConnectorCandidates(current, target, graph, previousStitch, stitch, connectorRole, previousBlock === nextBlock ? nextBlock : undefined);
      connectorCandidates.push(...candidates.map((candidate) => ({ ...candidate, id: `${candidate.id}-${index}` })));
      const selected = candidates[0];
      if (selected && !selected.isFreeHorizontal && candidates.some((candidate) => candidate.isFreeHorizontal)) {
        avoidedHorizontalConnectorCount += 1;
      }

      selected?.edges.forEach((draft) => {
        const connector: Edge = {
          ...draft,
          id: draft.type === "verticalVertexConnector"
            ? `vv-${verticalVertexConnectorEdges.length}`
            : draft.type === "retraceConnector"
              ? `rt-${retraceConnectorEdges.length}`
              : draft.type === "lShapeConnector"
                ? `ls-${lShapeConnectorEdges.length}`
                : draft.type === "contactConnector"
                  ? `contact-${contactConnectorEdges.length}`
                  : draft.type === "coveredConnector"
                    ? `cc-${coveredConnectorEdges.length}`
                    : `vc-${visibleConnectorEdges.length}`,
          cost: selected.cost,
          candidateReason: selected.id,
        };
        const length = edgeLength(graph, connector);
        if (length <= EPSILON_MM) return;
        connectorLengths.push(length);
        if (connector.type === "verticalVertexConnector") verticalVertexConnectorEdges.push(connector);
        else if (connector.type === "retraceConnector") retraceConnectorEdges.push(connector);
        else if (connector.type === "lShapeConnector") lShapeConnectorEdges.push(connector);
        else if (connector.type === "contactConnector") contactConnectorEdges.push(connector);
        else if (connector.type === "coveredConnector") coveredConnectorEdges.push(connector);
        else visibleConnectorEdges.push(connector);
        appendStep(connector);
      });
    }
    appendStep(stitch);
  });

  const allConnectorEdges = [
    ...visibleConnectorEdges,
    ...coveredConnectorEdges,
    ...contactConnectorEdges,
    ...verticalVertexConnectorEdges,
    ...lShapeConnectorEdges,
    ...retraceConnectorEdges,
  ];
  const freeHorizontalConnectorEdges = allConnectorEdges.filter((edge) => isFreeHorizontalEdge(graph, edge));
  const horizontalConnectorLength = freeHorizontalConnectorEdges.reduce((sum, edge) => sum + edgeLength(graph, edge), 0);

  const metrics: RouteMetrics = {
    connectorCount: connectorLengths.length,
    totalConnectorLength: connectorLengths.reduce((sum, length) => sum + length, 0),
    averageConnectorLength: connectorLengths.length
      ? connectorLengths.reduce((sum, length) => sum + length, 0) / connectorLengths.length
      : 0,
    longestConnector: Math.max(0, ...connectorLengths),
    routeLength,
    score: routeScore(connectorLengths, routeLength),
    rowGroupCount: graph.rowGroups?.length ?? groupStitchEdgesByRow(graph).length,
    rowChangeConnectorCount: allConnectorEdges.filter((edge) => edge.connectorRole === "rowChange").length,
    internalRowConnectorCount: allConnectorEdges.filter((edge) => edge.connectorRole === "internalRow").length,
    blockCount: blocks.length,
    blockConnectorCount: allConnectorEdges.filter((edge) => edge.connectorRole === "blockChange").length,
    internalBlockConnectorCount: allConnectorEdges.filter((edge) => edge.connectorRole !== "blockChange").length,
    verticalVertexConnectorCount: verticalVertexConnectorEdges.length,
    contactConnectorCount: contactConnectorEdges.length,
    lShapeConnectorCount: lShapeConnectorEdges.length,
    retraceConnectorCount: retraceConnectorEdges.length,
    externalConnectorCount: visibleConnectorEdges.filter((edge) => edge.connectorRole === "blockChange").length,
    outsideBlockConnectorCount: [...visibleConnectorEdges, ...lShapeConnectorEdges]
      .filter((edge) => edge.connectorRole === "blockChange").length,
    internalConnectorCount: [...coveredConnectorEdges, ...contactConnectorEdges, ...verticalVertexConnectorEdges, ...lShapeConnectorEdges, ...retraceConnectorEdges]
      .filter((edge) => edge.connectorRole !== "blockChange").length,
    horizontalConnectorCount: freeHorizontalConnectorEdges.length,
    horizontalConnectorLength,
    contactPointChainStepCount: contactConnectorEdges.filter((edge) => isVerticalEdge(graph, edge)).length,
    retraceToContactPointStepCount: retraceConnectorEdges.filter((edge) => touchesContactPoint(graph, edge)).length,
    avoidedHorizontalConnectorCount,
  };
  const finalPath =
    routeVertices.length === 0
      ? ""
      : routeVertices.map((vertex, index) => `${index === 0 ? "M" : "L"} ${vertex.x} ${vertex.y}`).join(" ");

  return {
    stitchEdges: graph.stitchEdges,
    visibleConnectorEdges,
    coveredConnectorEdges,
    contactConnectorEdges,
    verticalVertexConnectorEdges,
    lShapeConnectorEdges,
    retraceConnectorEdges,
    manualConnectorEdges: [],
    manualRetraceConnectorEdges: [],
    connectorCandidates,
    contactPointGraph,
    blocks,
    routeVertices,
    routeSteps,
    finalPath,
    metrics,
  };
}

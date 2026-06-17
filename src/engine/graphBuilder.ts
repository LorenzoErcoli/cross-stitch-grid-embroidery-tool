import { coordinateKey } from "../model/graph";
import type { ContactPoint, Edge, OrientedCellGeometry, PatternPrimitive, RowGroup, Vertex, VertexGraph } from "../model/types";

function registerVertex(vertices: Record<string, Vertex>, point: { x: number; y: number }): string {
  const id = coordinateKey(point.x, point.y);
  vertices[id] ??= { id, ...point };
  return id;
}

export function buildGraph(geometry: OrientedCellGeometry[], primitive: PatternPrimitive): VertexGraph {
  const vertices: Record<string, Vertex> = {};
  const stitchEdges: Edge[] = [];

  for (const item of geometry) {
    const cellKey = `${item.cell.row}:${item.cell.col}`;
    const startPoint = item.orientation === "diagonalDown" ? item.vertices.topLeft : item.vertices.bottomLeft;
    const endPoint = item.orientation === "diagonalDown" ? item.vertices.bottomRight : item.vertices.topRight;
    const startVertex = registerVertex(vertices, startPoint);
    const endVertex = registerVertex(vertices, endPoint);

    for (let repetition = 0; repetition < primitive.repetitions; repetition += 1) {
      stitchEdges.push({
        id: `s-${cellKey}-${repetition}`,
        startVertex,
        endVertex,
        type: "stitch",
        cellKey,
        repetition,
        sequence: 0,
        orientation: item.orientation,
        patternOrder: item.patternOrder,
        cellRow: item.cell.row,
        cellCol: item.cell.col,
      });
    }
  }

  const contactPoints: Record<string, ContactPoint> = {};
  for (const edge of stitchEdges) {
    const mate = stitchEdges.find((candidate) =>
      candidate.repetition === edge.repetition
      && candidate.cellRow === edge.cellRow
      && candidate.cellCol === (edge.cellCol ?? 0) + 1
      && candidate.orientation !== edge.orientation,
    );
    if (!mate) continue;
    const sharedVertex = [edge.startVertex, edge.endVertex].find((vertexId) =>
      mate.startVertex === vertexId || mate.endVertex === vertexId,
    );
    if (!sharedVertex) continue;
    const existing = contactPoints[sharedVertex];
    contactPoints[sharedVertex] = existing
      ? { ...existing, edgeIds: [...new Set([...existing.edgeIds, edge.id, mate.id])] }
      : {
          id: `contact-${edge.cellRow}-${edge.cellCol}`,
          vertexId: sharedVertex,
          edgeIds: [edge.id, mate.id],
          row: edge.cellRow!,
          leftCol: edge.cellCol!,
        };
  }

  const vertexUseCounts = new Map<string, number>();
  for (const edge of stitchEdges) {
    vertexUseCounts.set(edge.startVertex, (vertexUseCounts.get(edge.startVertex) ?? 0) + 1);
    vertexUseCounts.set(edge.endVertex, (vertexUseCounts.get(edge.endVertex) ?? 0) + 1);
  }
  const sharedVertexIds = [...vertexUseCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([vertexId]) => vertexId);

  const rowGroups = groupStitchEdgesByRow(stitchEdges);

  return { vertices, stitchEdges, contactPoints, sharedVertexIds, rowGroups };
}

export function groupStitchEdgesByRow(stitchEdges: Edge[]): RowGroup[] {
  const rows = new Map<number, Edge[]>();
  for (const edge of stitchEdges) {
    if (edge.cellRow === undefined) continue;
    const rowEdges = rows.get(edge.cellRow) ?? [];
    rowEdges.push(edge);
    rows.set(edge.cellRow, rowEdges);
  }

  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, edges], index) => {
      const direction = index % 2 === 0 ? "leftToRight" : "rightToLeft";
      const sorted = [...edges].sort((a, b) => {
        const colDiff = (a.cellCol ?? 0) - (b.cellCol ?? 0);
        return direction === "leftToRight" ? colDiff : -colDiff;
      });
      return { row, direction, edgeIds: sorted.map((edge) => edge.id) };
    });
}

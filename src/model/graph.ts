import type { Vertex, VertexGraph } from "./types";

export const coordinateKey = (x: number, y: number) => `${x},${y}`;

export function getVertex(graph: VertexGraph, id: string): Vertex {
  const vertex = graph.vertices[id];
  if (!vertex) throw new Error(`Missing vertex: ${id}`);
  return vertex;
}

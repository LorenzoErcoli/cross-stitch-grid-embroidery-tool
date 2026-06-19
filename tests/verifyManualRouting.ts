import { strict as assert } from "node:assert";
import { applyManualOverrides, getConnectorEdges } from "../src/engine/manualRouting";
import { routeGraph } from "../src/engine/routingEngine";
import type { VertexGraph } from "../src/model/types";

const graph: VertexGraph = {
  vertices: {
    a: { id: "a", x: 0, y: 0 },
    b: { id: "b", x: 10, y: 0 },
    c: { id: "c", x: 20, y: 0 },
  },
  stitchEdges: [
    { id: "s0", startVertex: "a", endVertex: "b", type: "stitch" },
    { id: "s1", startVertex: "c", endVertex: "b", type: "stitch" },
  ],
};

const automatic = routeGraph(graph);
const connector = getConnectorEdges(automatic)[0];
const result = applyManualOverrides(graph, automatic, [{
  id: "override-test",
  connectorId: connector.id,
  originalStart: graph.vertices[connector.startVertex],
  originalEnd: graph.vertices[connector.endVertex],
  points: [{ x: 15, y: 5 }],
  type: "manualConnector",
  createdAt: "2026-06-19T00:00:00.000Z",
  updatedAt: "2026-06-19T00:00:00.000Z",
}]).output;

assert.equal(result.manualConnectorEdges.length, 2);
assert.equal(result.routeSteps.some((step) => step.edge.id === connector.id), false);
assert.equal(result.finalPath.includes("15 5"), true);

applyManualOverrides(graph, automatic, []);
assert.equal(Object.keys(graph.vertices).some((vertexId) => vertexId.startsWith("manual:")), false);

console.log("Manual routing verification passed.");

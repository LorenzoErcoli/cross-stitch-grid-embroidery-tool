import { strict as assert } from "node:assert";
import { buildGraph } from "../src/engine/graphBuilder";
import { generatePattern } from "../src/engine/patternGenerator";
import { buildContactPointGraph, detectConnectedBlocks, findContactPointConnector, routeGraph } from "../src/engine/routingEngine";
import { getGridWarnings, setCellOrientation } from "../src/model/grid";
import type { Cell, GridConfig, PatternPrimitive, VertexGraph } from "../src/model/types";
import { getAdaptiveVisualSizes } from "../src/model/visual";

const grid: GridConfig = { rows: 1, columns: 2, cellWidth: 10, cellHeight: 10, gapX: 0, gapY: 0 };
const primitive: PatternPrimitive = {
  type: "alternatingDiagonal",
  repetitions: 1,
};
const cells: Cell[] = [
  { row: 0, col: 0, enabled: true, orientation: "diagonalDown" },
  { row: 0, col: 1, enabled: true, orientation: "diagonalUp" },
];

const graph = buildGraph(generatePattern(cells, grid, primitive).geometry, primitive);
const output = routeGraph(graph);

assert.equal(graph.stitchEdges.length, 2, "each cell must produce exactly one stitch edge");
assert.deepEqual(graph.stitchEdges.map((edge) => edge.orientation), ["diagonalDown", "diagonalUp"]);
assert.deepEqual(graph.stitchEdges.map((edge) => edge.patternOrder), [1, 2]);
assert.deepEqual(
  graph.stitchEdges.map((edge) => edge.repetition),
  [0, 0],
  "repetitions must duplicate each derived diagonal",
);
assert.equal(Object.keys(graph.vertices).length, 3, "adjacent alternating diagonals must reuse graph vertices");
assert.equal(graph.sharedVertexIds?.length, 1, "shared diagonal meetings must be tracked as shared vertices");
assert.equal(Object.keys(graph.contactPoints ?? {}).length, 1, "shared diagonal meeting must become a contact point");
assert.deepEqual(graph.rowGroups?.map((group) => group.direction), ["leftToRight"], "row groups must expose serpentine direction");
assert.equal(output.metrics.blockCount, 1, "connected stitches must route as one block");
assert.equal(output.visibleConnectorEdges.length, 0, "compatible fixed edge directions must avoid connectors");
assert.ok(output.finalPath.startsWith("M "), "route must produce a valid SVG path");
assert.equal(output.routeVertices.length, output.routeSteps.length + 1, "route must remain continuous");
assert.equal(getGridWarnings({ ...grid, gapX: -10 }).length, 1, "invalid negative gaps must produce a warning");

const coveredGraph: VertexGraph = {
  vertices: {
    a: { id: "a", x: 0, y: 0 },
    b: { id: "b", x: 10, y: 10 },
    d: { id: "d", x: 20, y: 0 },
    e: { id: "e", x: 30, y: 10 },
  },
  stitchEdges: [
    { id: "s0", startVertex: "a", endVertex: "b", type: "stitch" },
    { id: "s1", startVertex: "d", endVertex: "e", type: "stitch" },
    { id: "s2", startVertex: "b", endVertex: "d", type: "stitch" },
  ],
};
const coveredOutput = routeGraph(coveredGraph);
for (const step of coveredOutput.routeSteps.filter((step) => step.edge.type === "stitch")) {
  const fixed = coveredGraph.stitchEdges.find((edge) => edge.id === step.edge.id)!;
  assert.equal(step.edge.startVertex, fixed.startVertex, "routing must preserve fixed start vertices");
  assert.equal(step.edge.endVertex, fixed.endVertex, "routing must preserve fixed end vertices");
}
assert.ok(coveredOutput.metrics.score > 0, "optimized route must expose its score");
assert.equal(setCellOrientation(cells, 0, 0, "diagonalUp")[0].orientation, "diagonalUp");

const directCoveredGraph: VertexGraph = {
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
assert.equal(routeGraph(directCoveredGraph).retraceConnectorEdges.length, 1, "direct pattern overlap must be retraced");

const zeroConnectorGraph: VertexGraph = {
  vertices: {
    a: { id: "a", x: 0, y: 0 },
    b: { id: "b", x: 10, y: 0 },
    c: { id: "c", x: 10.0005, y: 0 },
    d: { id: "d", x: 20, y: 0 },
  },
  stitchEdges: [
    { id: "s0", startVertex: "a", endVertex: "b", type: "stitch" },
    { id: "s1", startVertex: "c", endVertex: "d", type: "stitch" },
  ],
};
assert.equal(routeGraph(zeroConnectorGraph).metrics.connectorCount, 0, "EPSILON-length connectors must not be counted");

const blockGraph: VertexGraph = {
  vertices: {
    a: { id: "a", x: 0, y: 0 },
    b: { id: "b", x: 10, y: 0 },
    c: { id: "c", x: 10, y: 0 },
    d: { id: "d", x: 20, y: 0 },
    e: { id: "e", x: 100, y: 0 },
    f: { id: "f", x: 110, y: 0 },
  },
  stitchEdges: [
    { id: "s0", startVertex: "a", endVertex: "b", type: "stitch", cellRow: 0, cellCol: 0 },
    { id: "s1", startVertex: "c", endVertex: "d", type: "stitch", cellRow: 0, cellCol: 1 },
    { id: "s2", startVertex: "e", endVertex: "f", type: "stitch", cellRow: 0, cellCol: 8 },
  ],
};
assert.equal(detectConnectedBlocks(blockGraph.stitchEdges, blockGraph).length, 2, "separate regions must become separate blocks");
assert.deepEqual(
  routeGraph(blockGraph).routeSteps.filter((step) => step.edge.type === "stitch").map((step) => step.edge.id).slice(0, 2),
  ["s0", "s1"],
  "routing must complete a block before moving to the next block",
);

const verticalGraph: VertexGraph = {
  vertices: {
    a: { id: "a", x: 0, y: 0 },
    b: { id: "b", x: 10, y: 10 },
    c: { id: "c", x: 10, y: 20 },
    d: { id: "d", x: 20, y: 30 },
  },
  stitchEdges: [
    { id: "s0", startVertex: "a", endVertex: "b", type: "stitch", cellRow: 0, cellCol: 0 },
    { id: "s1", startVertex: "c", endVertex: "d", type: "stitch", cellRow: 1, cellCol: 0 },
  ],
};
assert.equal(routeGraph(verticalGraph).verticalVertexConnectorEdges.length, 1, "same-X transitions must use vertical vertex connectors");

const lShapeGraph: VertexGraph = {
  vertices: {
    a: { id: "a", x: 0, y: 0 },
    b: { id: "b", x: 10, y: 10 },
    c: { id: "c", x: 24, y: 0 },
    d: { id: "d", x: 34, y: 10 },
  },
  stitchEdges: [
    { id: "s0", startVertex: "a", endVertex: "b", type: "stitch", cellRow: 0, cellCol: 0 },
    { id: "s1", startVertex: "c", endVertex: "d", type: "stitch", cellRow: 0, cellCol: 4 },
  ],
};
const lShapeOutput = routeGraph(lShapeGraph);
assert.equal(lShapeOutput.lShapeConnectorEdges.length, 2, "oblique jumps must be replaced by L-shaped connectors");
assert.equal(lShapeOutput.visibleConnectorEdges.length, 0, "L-shaped candidates must beat direct visible diagonal jumps");

const chevronGraph: VertexGraph = {
  vertices: {
    a: { id: "a", x: 0, y: 0 },
    topCenter: { id: "topCenter", x: 10, y: 10 },
    b: { id: "b", x: 20, y: 0 },
    c: { id: "c", x: 0, y: 10 },
    bottomCenter: { id: "bottomCenter", x: 10, y: 20 },
    d: { id: "d", x: 20, y: 10 },
  },
  stitchEdges: [
    { id: "top-left", startVertex: "a", endVertex: "topCenter", type: "stitch", orientation: "diagonalDown", cellRow: 0, cellCol: 0, repetition: 0 },
    { id: "top-right", startVertex: "topCenter", endVertex: "b", type: "stitch", orientation: "diagonalUp", cellRow: 0, cellCol: 1, repetition: 0 },
    { id: "bottom-left", startVertex: "c", endVertex: "bottomCenter", type: "stitch", orientation: "diagonalDown", cellRow: 1, cellCol: 0, repetition: 0 },
    { id: "bottom-right", startVertex: "bottomCenter", endVertex: "d", type: "stitch", orientation: "diagonalUp", cellRow: 1, cellCol: 1, repetition: 0 },
  ],
  contactPoints: {
    topCenter: { id: "contact-top", vertexId: "topCenter", edgeIds: ["top-left", "top-right"], row: 0, leftCol: 0 },
    bottomCenter: { id: "contact-bottom", vertexId: "bottomCenter", edgeIds: ["bottom-left", "bottom-right"], row: 1, leftCol: 0 },
  },
};
assert.equal(
  findContactPointConnector(chevronGraph.stitchEdges[1], chevronGraph.stitchEdges[2], chevronGraph)?.some(
    (edge) => edge.type === "contactConnector",
  ),
  true,
);
assert.equal(routeGraph(chevronGraph).contactConnectorEdges.length, 1, "routing must prefer the vertical contact connector");
assert.equal(routeGraph(chevronGraph).metrics.rowGroupCount, 2, "stacked chevrons must be routed as row groups");
assert.equal(buildContactPointGraph(chevronGraph).edges.length > 0, true, "contact points must build a routing graph");

const routedChevron = routeGraph(chevronGraph);
assert.equal(routedChevron.metrics.horizontalConnectorCount, 0, "contact point routing must avoid free horizontal connectors");
assert.equal(routedChevron.metrics.contactPointChainStepCount, 1, "vertical contact point links must be counted as chain steps");
assert.equal(routedChevron.contactPointGraph.nodes.length, 2, "engine output must expose contact point graph nodes");

const smallVisual = getAdaptiveVisualSizes({ ...grid, cellWidth: 1, cellHeight: 1 }, 2);
assert.equal(smallVisual.smallCellMode, true, "1 mm cells must enable small cell mode");
assert.equal(smallVisual.showRouteLabels, false, "small cell mode must suppress invasive route labels");

console.log("Engine verification passed.");

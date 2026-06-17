import { describe, expect, it } from "vitest";
import { buildGraph } from "../src/engine/graphBuilder";
import { generatePattern } from "../src/engine/patternGenerator";
import { buildContactPointGraph, detectConnectedBlocks, findContactPointConnector, routeGraph } from "../src/engine/routingEngine";
import { createCells, getGridWarnings, setCellOrientation } from "../src/model/grid";
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

describe("graph-first embroidery engine", () => {
  it("keeps manually assigned orientations stable when other cells change", () => {
    let manualCells = createCells({ ...grid, columns: 3 });
    manualCells = setCellOrientation(manualCells, 0, 0, "diagonalUp");
    manualCells = setCellOrientation(manualCells, 0, 2, "diagonalDown");
    manualCells = setCellOrientation(manualCells, 0, 1, "diagonalUp");
    manualCells = setCellOrientation(manualCells, 0, 1, null);
    const graph = buildGraph(generatePattern(manualCells, { ...grid, columns: 3 }, primitive).geometry, primitive);
    expect(graph.stitchEdges.map((edge) => edge.orientation)).toEqual(["diagonalUp", "diagonalDown"]);
  });

  it("reuses shared vertices to route a zig-zag without connectors", () => {
    const graph = buildGraph(generatePattern(cells, grid, primitive).geometry, primitive);
    const output = routeGraph(graph);
    expect(Object.keys(graph.vertices).length).toBe(3);
    expect(graph.sharedVertexIds).toHaveLength(1);
    expect(Object.keys(graph.contactPoints ?? {})).toHaveLength(1);
    expect(output.metrics.blockCount).toBe(1);
    expect(output.visibleConnectorEdges).toHaveLength(0);
    expect(output.coveredConnectorEdges).toHaveLength(0);
    expect(output.finalPath).toMatch(/^M /);
    expect(output.routeVertices.length).toBe(output.routeSteps.length + 1);
  });

  it("does not insert or count zero-length connectors within EPSILON", () => {
    const graph: VertexGraph = {
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
    const output = routeGraph(graph);
    expect(output.visibleConnectorEdges).toHaveLength(0);
    expect(output.coveredConnectorEdges).toHaveLength(0);
    expect(output.contactConnectorEdges).toHaveLength(0);
    expect(output.metrics.connectorCount).toBe(0);
  });

  it("groups row stitches in serpentine order", () => {
    const twoRowCells: Cell[] = [
      { row: 0, col: 0, enabled: true, orientation: "diagonalDown" },
      { row: 0, col: 1, enabled: true, orientation: "diagonalUp" },
      { row: 1, col: 0, enabled: true, orientation: "diagonalDown" },
      { row: 1, col: 1, enabled: true, orientation: "diagonalUp" },
    ];
    const twoRowGrid: GridConfig = { rows: 2, columns: 2, cellWidth: 10, cellHeight: 10, gapX: 0, gapY: 0 };
    const graph = buildGraph(generatePattern(twoRowCells, twoRowGrid, primitive).geometry, primitive);
    expect(graph.rowGroups?.map((group) => group.direction)).toEqual(["leftToRight", "rightToLeft"]);
    expect(routeGraph(graph).metrics.rowGroupCount).toBe(2);
  });

  it("detects separate connected blocks and completes each block before moving on", () => {
    const graph: VertexGraph = {
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
    const blocks = detectConnectedBlocks(graph.stitchEdges, graph);
    expect(blocks).toHaveLength(2);
    const routedStitches = routeGraph(graph).routeSteps.filter((step) => step.edge.type === "stitch").map((step) => step.edge.id);
    expect(routedStitches.slice(0, 2)).toEqual(["s0", "s1"]);
  });

  it("prefers vertical vertex connectors before contact point connectors", () => {
    const graph: VertexGraph = {
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
    const output = routeGraph(graph);
    expect(output.verticalVertexConnectorEdges).toHaveLength(1);
    expect(output.contactConnectorEdges).toHaveLength(0);
    expect(output.visibleConnectorEdges).toHaveLength(0);
  });

  it("uses L-shaped connectors instead of long diagonal visible jumps", () => {
    const graph: VertexGraph = {
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
    const output = routeGraph(graph);
    expect(output.lShapeConnectorEdges).toHaveLength(2);
    expect(output.visibleConnectorEdges).toHaveLength(0);
    expect(output.lShapeConnectorEdges.every((edge) => edge.cost !== undefined)).toBe(true);
  });

  it("never reverses fixed stitch edges while optimizing their order", () => {
    const graph: VertexGraph = {
      vertices: {
        a: { id: "a", x: 0, y: 0 },
        b: { id: "b", x: 10, y: 10 },
        d: { id: "d", x: 20, y: 0 },
        e: { id: "e", x: 30, y: 10 },
      },
      stitchEdges: [
        { id: "s0", startVertex: "a", endVertex: "b", type: "stitch", orientation: "diagonalDown" },
        { id: "s1", startVertex: "d", endVertex: "e", type: "stitch", orientation: "diagonalDown" },
        { id: "s2", startVertex: "b", endVertex: "d", type: "stitch", orientation: "diagonalUp" },
      ],
    };
    const output = routeGraph(graph);
    const routedStitches = output.routeSteps.filter((step) => step.edge.type === "stitch").map((step) => step.edge);
    for (const stitch of routedStitches) {
      const fixed = graph.stitchEdges.find((edge) => edge.id === stitch.id)!;
      expect(stitch.startVertex).toBe(fixed.startVertex);
      expect(stitch.endVertex).toBe(fixed.endVertex);
    }
    expect(output.metrics.score).toBeGreaterThan(0);
  });

  it("marks a direct connector as retrace when a pattern stitch overlaps it", () => {
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
    const output = routeGraph(graph);
    expect(output.retraceConnectorEdges).toHaveLength(1);
    expect(output.visibleConnectorEdges).toHaveLength(0);
    expect(output.metrics.totalConnectorLength).toBe(10);
  });

  it("routes through graph contact points with covered diagonal returns", () => {
    const graph: VertexGraph = {
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
    const connectors = findContactPointConnector(graph.stitchEdges[1], graph.stitchEdges[2], graph)!;
    expect(connectors.map((edge) => edge.type)).toEqual(["coveredConnector", "contactConnector", "coveredConnector"]);
    expect(connectors[1]).toMatchObject({ startVertex: "topCenter", endVertex: "bottomCenter" });
    const output = routeGraph(graph);
    expect(output.contactConnectorEdges).toHaveLength(1);
    expect(output.visibleConnectorEdges).toHaveLength(0);
    expect(output.metrics.horizontalConnectorCount).toBe(0);
    expect(output.metrics.contactPointChainStepCount).toBe(1);
    expect(output.contactPointGraph.nodes).toHaveLength(2);
    expect(buildContactPointGraph(graph).edges.length).toBeGreaterThan(0);
  });

  it("accepts negative gaps while warning on non-positive steps", () => {
    expect(getGridWarnings({ ...grid, gapX: -9, gapY: -9 })).toHaveLength(0);
    expect(getGridWarnings({ ...grid, gapX: -10 })).toContain("Cell width + Gap X must be greater than 0.");
  });

  it("scales debug graphics down for small cells and zoom level", () => {
    const visual = getAdaptiveVisualSizes({ ...grid, cellWidth: 1, cellHeight: 1 }, 2);
    expect(visual.smallCellMode).toBe(true);
    expect(visual.debugPointRadius).toBeLessThanOrEqual(0.18);
    expect(visual.connectorStrokeWidth).toBeLessThanOrEqual(0.12);
    expect(visual.showRouteLabels).toBe(false);
  });
});

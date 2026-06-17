# ThreadRoute Grid Lab

A graph-first grid stitch path designer built with React, Vite, and TypeScript. Cells define the desired pattern, but the authoritative output is an ordered vertex-graph route suitable for SVG visualization today and future embroidery formats later.

## Setup

```bash
npm install
npm run dev
```

Production and test commands:

```bash
npm test
npm run build
```

## Project Structure

```text
src/
  components/   Editor controls, SVG canvas, debug stats, presets, export
  engine/       Pattern generation, graph construction, routing, SVG export
  model/        Shared domain types, grid operations, geometry, graph helpers
  storage/      LocalStorage preset persistence
  styles/       Global application styles
  utils/        Browser download helper
tests/          Focused graph and routing verification
```

## Data Flow

```text
Grid Editor
  -> Manual Cell Orientation
  -> Cell Geometry
  -> Fixed Stitch Edges
  -> Connected Block Detection
  -> Block-first Route Optimization
  -> Connector Generation
  -> Ordered Route
  -> SVG Preview / Export
```

`model/types.ts` defines the contracts between every stage. Each cell stores its orientation permanently. `engine/patternOrientation.ts` transfers stored orientations into geometry without recalculating them. `engine/graphBuilder.ts` registers coordinate-based vertices and creates fixed directed stitch edges. `engine/routingEngine.ts` may reorder those edges but never reverse them.

## V2.8 Drawing And Routing Behavior

- Left click sets a cell to `diagonalDown`.
- Right click sets a cell to `diagonalUp`.
- Shift + click clears a cell.
- The UI allows grids up to `1000 x 1000` cells.
- Cell width and height can be as small as `1 mm`.
- Cell orientations remain stable when other cells are added or removed.
- Stitch edge direction is fixed before routing and is never reversed.
- The router detects connected blocks before ordering stitch segments.
- Connected blocks are completed before routing moves to the next block.
- A block can be connected by shared vertices, contact points, adjacent cells, or near-identical vertices.
- Internal block order is serpentine/linear when cell row and column data are available.
- The global block order chooses the next closest block after the current block is complete.
- Routes are scored using connector count, total connector length, longest connector, and total route length.
- The score is `connectorCount * 1000 + totalConnectorLength * 10 + longestConnector * 50 + routeLength`.
- Connectors are always direct shortest segments. Exact overlap with a future stitch is classified as `coveredConnector`.
- Chevron meetings are registered as real `contactPoint` nodes in the vertex graph.
- `findContactPointConnector` builds transitions through vertically aligned contact points.
- Returning to or leaving a contact point along an existing diagonal creates a `coveredConnector`.
- Stitch transitions inside the same chevron also return through their shared contact point instead of using an outer cell border.
- The vertical center-to-center segment is a solid red `contactConnector`.
- Vertical vertex-to-vertex transitions use `verticalVertexConnector` and take priority over contact-point routing.
- Contact-point transitions remain available, but are no longer forced when a cleaner vertical vertex connector exists.
- Connector selection is cost-based: vertical, L-shaped, contact, covered, and visible candidates are compared before a route segment is chosen.
- Connector selection now strongly penalizes paths outside the local block bounding box.
- Diagonal visible jumps receive a proportional penalty, but L-shaped connectors are not allowed to dominate internal contact/retrace routes.
- Existing pattern diagonals can be reused as `retraceConnector` movements before external visible connectors are considered.
- Direct movement over a pattern edge is classified as `retraceConnector`.
- `lShapeConnector` segments are rendered in orange and split into explicit horizontal/vertical connector edges.
- `retraceConnector` segments are rendered as dashed orange and are included in the final path.
- Debug can show connector costs and candidate connector alternatives.
- Negative gaps are supported while `cellWidth + gapX` and `cellHeight + gapY` remain positive.
- Connector generation uses `EPSILON_MM = 0.001`; zero-length transitions are not inserted, drawn, or counted.
- Shared stitch vertices are tracked separately from contact points and can be shown as a debug layer.
- Row groups are generated in serpentine order: first active row left-to-right, next active row right-to-left, alternating.
- Row change and internal row connectors are classified in route metrics.
- Debug statistics include shared vertices, contact points, row groups, blocks, block connectors, retrace connectors, L-shaped connectors, external/outside/internal connector counts, route steps, total/average/longest connector length, and route score.
- Grid dimensions and exported SVG dimensions are expressed in millimeters with an explicit SVG `viewBox`.
- The preview supports zoom in, zoom out, reset view, middle-button pan, and Space+Drag pan. These controls only change the view, not route coordinates.
- A reference image can be uploaded under the grid, hidden, faded, scaled, offset, debugged with image bounds, and fit to the viewport. It is a preview-only layer and is not exported.
- The preview no longer renders one SVG cell for every empty grid cell. It uses a single coordinate-based hit overlay plus active-cell highlights.
- Grid drawing uses SVG pattern/major-line rendering: detailed grid lines appear only when zoom is sufficient, with major lines every 10 cells.
- Debug marker radii, connector strokes, grid strokes, and route-label font sizes are computed by `getAdaptiveVisualSizes(config, zoomLevel)`.
- `smallCellMode` activates automatically at `cellWidth <= 3 mm` or `cellHeight <= 3 mm`, reducing markers and suppressing oversized route labels.

## Current Limitations

- The block-first strategy is deterministic and intentionally local; it is not a global traveling-salesman solution.
- The data model still stores cells in memory, so million-cell workflows should keep active cells sparse for now.
- Contact connectors require real shared graph vertices and vertically aligned contact points.
- Disconnected regions are joined with technical connectors rather than represented as jumps or trims.
- SVG export does not yet encode machine-specific stitch, jump, trim, or color-change semantics.

## Recommended Next Steps

1. Introduce a `RoutingStrategy` interface so greedy, graph-search, and machine-aware strategies can coexist.
2. Add connector cost policies for distance, turns, overlap, hidden travel, and jump/trim thresholds.
3. Model route operations explicitly instead of treating every route step as a drawable edge.
4. Add primitive generators for cross, running stitch, triple cross, satin, and zigzag.
5. Add JSON project import/export and route snapshots for regression testing.
6. Add DST/PES-oriented stitch-length subdivision and machine-format exporters.

## Routing Architecture Improvements

The next routing layer should consume immutable stitch obligations rather than mutating the graph. Each obligation should declare legal orientations, ordering constraints, and repetition groups. A strategy can then solve an ordered walk using a configurable cost function and return explicit operations such as `stitch`, `travel`, `jump`, `trim`, and `colorChange`. This preserves the vertex graph as the source of truth while allowing optimization algorithms to evolve independently.

import type { EngineOutput, VertexGraph } from "../model/types";

interface Props {
  graph: VertexGraph;
  output: EngineOutput;
  activeCells: number;
}

export function DebugPanel({ graph, output, activeCells }: Props) {
  const stats = [
    ["Active cells", activeCells],
    ["Graph vertices", Object.keys(graph.vertices).length],
    ["Shared vertices", graph.sharedVertexIds?.length ?? 0],
    ["Contact points", Object.keys(graph.contactPoints ?? {}).length],
    ["Stitch edges", output.stitchEdges.length],
    ["Visible connectors", output.visibleConnectorEdges.length],
    ["Covered connectors", output.coveredConnectorEdges.length],
    ["Contact connectors", output.contactConnectorEdges.length],
    ["Vertical vertex connectors", output.verticalVertexConnectorEdges.length],
    ["L-shape connectors", output.lShapeConnectorEdges.length],
    ["Retrace connectors", output.retraceConnectorEdges.length],
    ["Manual connectors", output.manualConnectorEdges.length],
    ["Manual retrace connectors", output.manualRetraceConnectorEdges.length],
    ["Horizontal connectors", output.metrics.horizontalConnectorCount],
    ["Horizontal connector length", output.metrics.horizontalConnectorLength.toFixed(1)],
    ["Contact point chain steps", output.metrics.contactPointChainStepCount],
    ["Retrace to contact point", output.metrics.retraceToContactPointStepCount],
    ["Avoided horizontal connectors", output.metrics.avoidedHorizontalConnectorCount],
    ["External connectors", output.metrics.externalConnectorCount],
    ["Outside block connectors", output.metrics.outsideBlockConnectorCount],
    ["Internal connectors", output.metrics.internalConnectorCount],
    ["Row groups", output.metrics.rowGroupCount],
    ["Row change connectors", output.metrics.rowChangeConnectorCount],
    ["Internal row connectors", output.metrics.internalRowConnectorCount],
    ["Blocks", output.metrics.blockCount],
    ["Block connectors", output.metrics.blockConnectorCount],
    ["Internal block connectors", output.metrics.internalBlockConnectorCount],
    ["Route steps", output.routeSteps.length],
    ["Total connector length", output.metrics.totalConnectorLength.toFixed(1)],
    ["Average connector length", output.metrics.averageConnectorLength.toFixed(1)],
    ["Longest connector", output.metrics.longestConnector.toFixed(1)],
    ["Route length", output.metrics.routeLength.toFixed(1)],
    ["Route score", output.metrics.score.toFixed(0)],
  ];

  return (
    <div className="stats-strip">
      {stats.map(([label, value]) => (
        <div className="stat" key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

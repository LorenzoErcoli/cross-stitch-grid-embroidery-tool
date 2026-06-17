import type { DebugOptions, GridConfig, PatternPrimitive } from "../model/types";

interface Props {
  grid: GridConfig;
  primitive: PatternPrimitive;
  debug: DebugOptions;
  onGridChange: (grid: GridConfig) => void;
  onPrimitiveChange: (primitive: PatternPrimitive) => void;
  onDebugChange: (debug: DebugOptions) => void;
  onClear: () => void;
  onFill: () => void;
  warnings: string[];
}

const numberFields: { key: keyof GridConfig; label: string; min: number; max: number }[] = [
  { key: "rows", label: "Rows", min: 1, max: 1000 },
  { key: "columns", label: "Columns", min: 1, max: 1000 },
  { key: "cellWidth", label: "Cell width (mm)", min: 1, max: 80 },
  { key: "cellHeight", label: "Cell height (mm)", min: 1, max: 80 },
  { key: "gapX", label: "Gap X (mm)", min: -80, max: 40 },
  { key: "gapY", label: "Gap Y (mm)", min: -80, max: 40 },
];

const debugFields: { key: keyof DebugOptions; label: string }[] = [
  { key: "showGrid", label: "Grid" },
  { key: "showVertices", label: "Vertices" },
  { key: "showEdgeIds", label: "Edge IDs" },
  { key: "showStitchSegments", label: "Stitch segments" },
  { key: "showConnectorSegments", label: "Connectors" },
  { key: "showRouteOrder", label: "Route order" },
  { key: "showPatternOrder", label: "Pattern order" },
  { key: "showPatternOrientation", label: "Pattern orientation" },
  { key: "showConnectorLengths", label: "Connector lengths" },
  { key: "showSharedVertices", label: "Shared vertices" },
  { key: "showContactPoints", label: "Contact points" },
  { key: "showRowGroups", label: "Row groups" },
  { key: "showBlocks", label: "Blocks" },
  { key: "showImageBounds", label: "Image bounds" },
  { key: "showConnectorCost", label: "Connector cost" },
  { key: "showCandidateConnectors", label: "Candidate connectors" },
  { key: "showContactPointGraph", label: "Contact point graph" },
];

export function ParametersPanel({
  grid,
  primitive,
  debug,
  onGridChange,
  onPrimitiveChange,
  onDebugChange,
  onClear,
  onFill,
  warnings,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">TR</div>
        <div>
          <strong>ThreadRoute</strong>
          <span>Grid Lab</span>
        </div>
      </div>

      <section className="panel-section">
        <div className="section-heading">
          <span>01</span>
          <h2>Grid geometry</h2>
        </div>
        <div className="field-grid">
          {numberFields.map((field) => (
            <label className="field" key={field.key}>
              <span>{field.label}</span>
              <input
                min={field.min}
                max={field.max}
                type="number"
                value={grid[field.key]}
                onChange={(event) =>
                  onGridChange({
                    ...grid,
                    [field.key]: Math.min(field.max, Math.max(field.min, Number(event.target.value))),
                  })
                }
              />
            </label>
          ))}
        </div>
        <label className="field full-field">
          <span>Pattern repetitions</span>
          <input
            min="1"
            max="8"
            type="number"
            value={primitive.repetitions}
            onChange={(event) =>
              onPrimitiveChange({
                ...primitive,
                repetitions: Math.min(8, Math.max(1, Number(event.target.value))),
              })
            }
          />
        </label>
        <div className="button-row">
          <button className="secondary-button" onClick={onFill}>Fill all</button>
          <button className="secondary-button" onClick={onClear}>Clear</button>
        </div>
        {warnings.length > 0 && (
          <div className="warning-box" role="alert">
            {warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        )}
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <span>02</span>
          <h2>Debug layers</h2>
        </div>
        <div className="toggle-list">
          {debugFields.map((field) => (
            <label className="toggle" key={field.key}>
              <input
                type="checkbox"
                checked={debug[field.key]}
                onChange={() => onDebugChange({ ...debug, [field.key]: !debug[field.key] })}
              />
              <span className="toggle-track"><span /></span>
              <span>{field.label}</span>
            </label>
          ))}
        </div>
      </section>
    </aside>
  );
}

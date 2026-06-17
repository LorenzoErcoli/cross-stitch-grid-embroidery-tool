import type { ManualRouteOverride } from "../model/types";

interface Props {
  enabled: boolean;
  selectedConnectorId: string | null;
  selectedPointIndex: number | null;
  currentOverride?: ManualRouteOverride;
  disconnectedCount: number;
  showManualConnectors: boolean;
  showStitchDebugPoints: boolean;
  showManualPoints: boolean;
  showSnapAreas: boolean;
  showHitAreas: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onRemovePoint: () => void;
  onResetConnector: () => void;
  onApply: () => void;
  onTypeChange: (type: ManualRouteOverride["type"]) => void;
  onShowManualConnectorsChange: (show: boolean) => void;
  onShowStitchDebugPointsChange: (show: boolean) => void;
  onShowManualPointsChange: (show: boolean) => void;
  onShowSnapAreasChange: (show: boolean) => void;
  onShowHitAreasChange: (show: boolean) => void;
}

export function ManualRoutingPanel({
  enabled,
  selectedConnectorId,
  selectedPointIndex,
  currentOverride,
  disconnectedCount,
  showManualConnectors,
  showStitchDebugPoints,
  showManualPoints,
  showSnapAreas,
  showHitAreas,
  onEnabledChange,
  onRemovePoint,
  onResetConnector,
  onApply,
  onTypeChange,
  onShowManualConnectorsChange,
  onShowStitchDebugPointsChange,
  onShowManualPointsChange,
  onShowSnapAreasChange,
  onShowHitAreasChange,
}: Props) {
  return (
    <section className="panel-section">
      <div className="section-heading">
        <span>03</span>
        <h2>Manual Routing</h2>
      </div>
      <div className="toggle-list">
        <label className="toggle">
          <input type="checkbox" checked={enabled} onChange={() => onEnabledChange(!enabled)} />
          <span className="toggle-track"><span /></span>
          <span>Manual Route Edit</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showManualConnectors} onChange={() => onShowManualConnectorsChange(!showManualConnectors)} />
          <span className="toggle-track"><span /></span>
          <span>Show manual connectors</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showStitchDebugPoints} onChange={() => onShowStitchDebugPointsChange(!showStitchDebugPoints)} />
          <span className="toggle-track"><span /></span>
          <span>Show Stitch Debug Points</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showManualPoints} onChange={() => onShowManualPointsChange(!showManualPoints)} />
          <span className="toggle-track"><span /></span>
          <span>Show Manual Route Points</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showSnapAreas} onChange={() => onShowSnapAreasChange(!showSnapAreas)} />
          <span className="toggle-track"><span /></span>
          <span>Show snap areas</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showHitAreas} onChange={() => onShowHitAreasChange(!showHitAreas)} />
          <span className="toggle-track"><span /></span>
          <span>Show hit areas</span>
        </label>
      </div>
      <div className="manual-status">
        <span>Selected Connector ID</span>
        <strong>{selectedConnectorId ?? "none"}</strong>
        <span>Selected Manual Point ID</span>
        <strong>{selectedConnectorId && selectedPointIndex !== null ? `${selectedConnectorId}:P${selectedPointIndex + 1}` : "none"}</strong>
        <span>Override points</span>
        <strong>{currentOverride?.points.length ?? 0}</strong>
        <span>Disconnected</span>
        <strong>{disconnectedCount}</strong>
      </div>
      <div className="button-row manual-buttons">
        <button className="secondary-button" type="button" disabled={!selectedConnectorId} onClick={onApply}>Apply manual route</button>
        <button className="secondary-button" type="button" disabled={!currentOverride} onClick={onResetConnector}>Reset selected connector to auto</button>
      </div>
      <div className="button-row manual-buttons">
        <button className="secondary-button" type="button" disabled={selectedPointIndex === null} onClick={onRemovePoint}>Remove selected point</button>
        <button
          className="secondary-button"
          type="button"
          disabled={!currentOverride}
          onClick={() => onTypeChange(currentOverride?.type === "manualRetraceConnector" ? "manualConnector" : "manualRetraceConnector")}
        >
          {currentOverride?.type === "manualRetraceConnector" ? "Mark normal" : "Mark as retrace"}
        </button>
      </div>
    </section>
  );
}

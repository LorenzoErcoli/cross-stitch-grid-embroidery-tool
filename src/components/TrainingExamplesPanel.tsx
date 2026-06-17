import type { RoutingTrainingExample } from "../model/types";

interface Props {
  examples: RoutingTrainingExample[];
  reason: string;
  useful: boolean;
  canSave: boolean;
  onReasonChange: (reason: string) => void;
  onUsefulChange: (useful: boolean) => void;
  onSave: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
}

export function TrainingExamplesPanel({
  examples,
  reason,
  useful,
  canSave,
  onReasonChange,
  onUsefulChange,
  onSave,
  onExport,
  onImport,
  onClear,
}: Props) {
  return (
    <section className="panel-section">
      <div className="section-heading">
        <span>04</span>
        <h2>Training Examples</h2>
      </div>
      <label className="field full-field">
        <span>Reason / comment</span>
        <input value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="optional reason" />
      </label>
      <label className="toggle training-useful">
        <input type="checkbox" checked={useful} onChange={() => onUsefulChange(!useful)} />
        <span className="toggle-track"><span /></span>
        <span>Mark example as useful</span>
      </label>
      <div className="manual-status">
        <span>Examples</span>
        <strong>{examples.length}</strong>
      </div>
      <div className="button-row manual-buttons">
        <button className="secondary-button" type="button" disabled={!canSave} onClick={onSave}>Save current override</button>
        <button className="secondary-button" type="button" disabled={examples.length === 0} onClick={onExport}>Export JSON</button>
      </div>
      <div className="button-row manual-buttons">
        <label className="secondary-button file-button">
          Import JSON
          <input
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <button className="secondary-button" type="button" disabled={examples.length === 0} onClick={onClear}>Clear examples</button>
      </div>
    </section>
  );
}

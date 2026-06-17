import { useState } from "react";
import type { Preset } from "../model/types";

interface Props {
  presets: Preset[];
  onSave: (name: string) => void;
  onLoad: (preset: Preset) => void;
  onDelete: (id: string) => void;
}

export function PresetPanel({ presets, onSave, onLoad, onDelete }: Props) {
  const [name, setName] = useState("");

  return (
    <section className="preset-panel">
      <div>
        <span className="eyebrow">Local workspace</span>
        <h2>Presets</h2>
      </div>
      <div className="preset-save">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Preset name" />
        <button
          className="secondary-button"
          onClick={() => {
            const trimmed = name.trim();
            if (trimmed) {
              onSave(trimmed);
              setName("");
            }
          }}
        >
          Save
        </button>
      </div>
      <div className="preset-list">
        {presets.length === 0 && <span className="empty-state">No saved presets yet.</span>}
        {presets.map((preset) => (
          <div className="preset-item" key={preset.id}>
            <button className="preset-load" onClick={() => onLoad(preset)}>
              <strong>{preset.name}</strong>
              <span>{preset.grid.rows} × {preset.grid.columns} · {preset.cells.filter((cell) => cell.enabled).length} cells</span>
            </button>
            <button className="icon-button" aria-label={`Delete ${preset.name}`} onClick={() => onDelete(preset.id)}>×</button>
          </div>
        ))}
      </div>
    </section>
  );
}

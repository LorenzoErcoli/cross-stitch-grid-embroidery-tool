interface Props {
  includeGrid: boolean;
  onIncludeGridChange: (value: boolean) => void;
  onExport: () => void;
  onSaveProject: () => void;
  onOpenProject: (file: File) => void;
}

export function ExportPanel({ includeGrid, onIncludeGridChange, onExport, onSaveProject, onOpenProject }: Props) {
  return (
    <div className="export-controls">
      <label className="export-grid-check">
        <input type="checkbox" checked={includeGrid} onChange={(event) => onIncludeGridChange(event.target.checked)} />
        Include grid
      </label>
      <button className="secondary-button" type="button" onClick={onSaveProject}>Save Project</button>
      <label className="secondary-button file-button">
        Open Project
        <input
          type="file"
          accept="application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onOpenProject(file);
            event.currentTarget.value = "";
          }}
        />
      </label>
      <button className="primary-button" onClick={onExport}>Export SVG</button>
    </div>
  );
}

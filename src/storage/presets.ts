import type { Preset, ProjectState } from "../model/types";

const STORAGE_KEY = "threadroute-grid-presets-v1";

export function loadPresets(): Preset[] {
  try {
    const presets = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Preset[];
    return presets.map((preset) => ({
      ...preset,
      cells: preset.cells.map((cell, index) => ({
        ...cell,
        orientation: cell.enabled
          ? cell.orientation ?? (index % 2 === 0 ? "diagonalDown" : "diagonalUp")
          : null,
      })),
      primitive: {
        ...preset.primitive,
        type: "alternatingDiagonal",
      },
    }));
  } catch {
    return [];
  }
}

function persist(presets: Preset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function savePreset(name: string, project: ProjectState): Preset[] {
  const presets = loadPresets();
  presets.unshift({
    ...project,
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
  });
  persist(presets);
  return presets;
}

export function deletePreset(id: string): Preset[] {
  const presets = loadPresets().filter((preset) => preset.id !== id);
  persist(presets);
  return presets;
}

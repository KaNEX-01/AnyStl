import { PLATFORMS } from "./platforms";
import { SavedModel } from "./types";

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** A full backup that "Import" can read back. */
export function exportJson(models: SavedModel[]) {
  download(`anystl-saved-${stamp()}.json`, "application/json", JSON.stringify(models, null, 2));
}

/** For spreadsheets; not re-importable (use JSON for that). */
export function exportCsv(models: SavedModel[]) {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Quote everything; a leading = + - @ would be run as a formula by spreadsheet apps.
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const header = ["Title", "Site", "URL", "Likes", "Downloads", "Price", "License", "Files", "Collections", "Note", "Saved"];
  const rows = models.map((m) => [
    m.title,
    m.via || PLATFORMS[m.platform].name,
    m.url,
    m.likes,
    m.downloads,
    m.price,
    m.license,
    m.formats?.join(" "),
    m.collections?.join("; "),
    m.note,
    new Date(m.savedAt).toISOString(),
  ]);
  download(
    `anystl-saved-${stamp()}.csv`,
    "text/csv",
    "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n"),
  );
}

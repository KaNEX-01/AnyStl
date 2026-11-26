import { SLICER_PLATFORMS } from "./platforms";
import { ModelResult } from "./types";

export interface SendToOrcaResult {
  opened: boolean;
  count: number;
  fileUrl?: string;
  error?: string;
}

export function isEmbeddedOrca(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.hasAttribute("data-orca-theme")) return true;
  return typeof window !== "undefined" && "orca" in window;
}

/**
 * Returns the model entry that can be handed directly to OrcaSlicer: either
 * the model itself when its site allows keyless downloads, or a merged
 * alternate on one of those sites.
 */
export function resolveSlicerTarget(model: ModelResult): ModelResult | null {
  if (SLICER_PLATFORMS.includes(model.platform)) return model;
  return model.alternates?.find((alt) => SLICER_PLATFORMS.includes(alt.platform)) ?? null;
}

function validHttpUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Prepares a supported model's print files and sends them directly to OrcaSlicer.
 * Inside the embedded OrcaSlicer plugin WebView, dispatches through the local
 * AnyStl server (`POST /api/slicer/open`) with a manual download URL fallback.
 * In a regular browser or the AnyStl desktop app, opens `orcaslicer://open?file=...`.
 */
export async function sendModelToOrca(model: ModelResult): Promise<SendToOrcaResult> {
  const target = resolveSlicerTarget(model) ?? model;
  const payload = { url: target.url, platform: target.platform, title: model.title || target.title };

  if (isEmbeddedOrca()) {
    const res = await fetch("/api/slicer/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
    const fileUrl = validHttpUrl(data.fileUrl);
    if (data.opened) {
      return { opened: true, count: Number(data.count) || 1, fileUrl };
    }
    if (!fileUrl) throw new Error(data.error || "Invalid model file link");
    return {
      opened: false,
      count: Number(data.count) || 1,
      fileUrl,
      error: data.error || "Could not launch OrcaSlicer automatically. Copy the download URL below.",
    };
  }

  const params = new URLSearchParams(payload);
  const res = await fetch(`/api/slicer?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.link !== "string" || !data.link.startsWith("orcaslicer://open?file=")) {
    throw new Error(data.error || `Failed (${res.status})`);
  }
  window.location.href = data.link;
  return { opened: true, count: Number(data.count) || 1 };
}

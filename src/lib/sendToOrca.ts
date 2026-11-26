import { SLICER_PLATFORMS } from "./platforms";
import { isValidSlicerLink, SlicerId, SLICERS } from "./settings";
import { getCurrentSettings } from "./useSettings";
import { ModelResult } from "./types";

export interface SendToOrcaResult {
  opened: boolean;
  count: number;
  fileUrl?: string;
  slicerName: string;
  mode: "protocol" | "download";
  error?: string;
}

export function isEmbeddedOrca(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.hasAttribute("data-orca-theme")) return true;
  return typeof window !== "undefined" && "orca" in window;
}

/**
 * Returns the model entry that can be handed directly to a slicer: either
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

function triggerFileDownload(fileUrl: string) {
  const link = document.createElement("a");
  link.href = fileUrl;
  link.rel = "noopener noreferrer";
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Prepares a supported model's print files and sends them directly to the user's
 * configured slicer (OrcaSlicer, Bambu Studio, PrusaSlicer, Elegoo Slicer) or
 * downloads the prepared files directly when Direct Download is selected.
 */
export async function sendModelToOrca(model: ModelResult, slicerOverride?: SlicerId): Promise<SendToOrcaResult> {
  const target = resolveSlicerTarget(model) ?? model;
  const slicer: SlicerId = slicerOverride ?? (isEmbeddedOrca() ? "orcaslicer" : getCurrentSettings().slicer);
  const slicerName = SLICERS[slicer].shortName;
  const payload = { url: target.url, platform: target.platform, title: model.title || target.title, slicer };

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
      return { opened: true, count: Number(data.count) || 1, fileUrl, slicerName, mode: "protocol" };
    }
    if (!fileUrl) throw new Error(data.error || "Invalid model file link");
    return {
      opened: false,
      count: Number(data.count) || 1,
      fileUrl,
      slicerName,
      mode: "protocol",
      error: data.error || `Could not launch ${slicerName} automatically. Copy the download URL below.`,
    };
  }

  const params = new URLSearchParams(payload);
  const res = await fetch(`/api/slicer?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Failed (${res.status})`);
  }

  const count = Number(data.count) || 1;
  const fileUrl = validHttpUrl(data.fileUrl);

  if (slicer === "download" || data.mode === "download") {
    if (!fileUrl) throw new Error("Invalid model file link");
    triggerFileDownload(fileUrl);
    return { opened: true, count, fileUrl, slicerName, mode: "download" };
  }

  if (typeof data.link !== "string" || !isValidSlicerLink(data.link)) {
    throw new Error(data.error || `Failed (${res.status})`);
  }
  window.location.href = data.link;
  return { opened: true, count, fileUrl, slicerName, mode: "protocol" };
}

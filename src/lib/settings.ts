import { PLATFORMS } from "./platforms";
import { Platform } from "./types";

export const SLICER_IDS = ["orcaslicer", "bambustudio", "prusaslicer", "elegooslicer", "download"] as const;
export type SlicerId = (typeof SLICER_IDS)[number];

export const SEARCH_PRESET_IDS = ["all", "printing", "cad", "assets", "fast"] as const;
export type SearchPresetId = (typeof SEARCH_PRESET_IDS)[number];

export interface SlicerInfo {
  id: SlicerId;
  name: string;
  shortName: string;
  scheme: string | null;
  description: string;
}

export const SLICERS: Record<SlicerId, SlicerInfo> = {
  orcaslicer: {
    id: "orcaslicer",
    name: "OrcaSlicer",
    shortName: "OrcaSlicer",
    scheme: "orcaslicer",
    description: "Opens STL / 3MF files straight into OrcaSlicer via orcaslicer:// links.",
  },
  bambustudio: {
    id: "bambustudio",
    name: "Bambu Studio",
    shortName: "Bambu Studio",
    scheme: "bambustudio",
    description: "Opens STL / 3MF files straight into Bambu Studio via bambustudio:// links.",
  },
  prusaslicer: {
    id: "prusaslicer",
    name: "PrusaSlicer",
    shortName: "PrusaSlicer",
    scheme: "prusaslicer",
    description: "Opens STL / 3MF files straight into PrusaSlicer via prusaslicer:// links.",
  },
  elegooslicer: {
    id: "elegooslicer",
    name: "Elegoo Slicer",
    shortName: "Elegoo Slicer",
    scheme: "elegooslicer",
    description: "Opens STL / 3MF files straight into Elegoo Slicer via elegooslicer:// links.",
  },
  download: {
    id: "download",
    name: "Direct Download (Cura / Other)",
    shortName: "Downloads",
    scheme: null,
    description: "Downloads STL / 3MF / ZIP files directly so you can import them into Cura or any slicer.",
  },
};

export interface SearchPresetInfo {
  id: SearchPresetId;
  name: string;
  description: string;
}

export const SEARCH_PRESETS: Record<SearchPresetId, SearchPresetInfo> = {
  all: {
    id: "all",
    name: "All libraries",
    description: "3D printing, printer brands, CAD & engineering, and Blender / 3D assets.",
  },
  printing: {
    id: "printing",
    name: "3D Printing",
    description: "MakerWorld, Printables, Thingiverse, Thangs, MyMiniFactory, Creality, Makeronline and more.",
  },
  cad: {
    id: "cad",
    name: "CAD & Engineering",
    description: "GrabCAD, Tinkercad, and configured engineering catalogs like TraceParts.",
  },
  assets: {
    id: "assets",
    name: "3D Assets & Blender",
    description: "Sketchfab, Poly Haven, BlenderKit, Blend Swap, CGTrader, 3D Warehouse and more.",
  },
  fast: {
    id: "fast",
    name: "Fast (API only)",
    description: "Instant API-backed libraries without launching a headless browser.",
  },
};

export interface AppSettings {
  onboardingDone: boolean;
  slicer: SlicerId;
  defaultPreset: SearchPresetId;
}

export const DEFAULT_SETTINGS: AppSettings = {
  onboardingDone: false,
  slicer: "orcaslicer",
  defaultPreset: "all",
};

export function isSlicerId(value: unknown): value is SlicerId {
  return typeof value === "string" && (SLICER_IDS as readonly string[]).includes(value);
}

export function isSearchPresetId(value: unknown): value is SearchPresetId {
  return typeof value === "string" && (SEARCH_PRESET_IDS as readonly string[]).includes(value);
}

export function sanitizeSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const obj = raw as Record<string, unknown>;
  return {
    onboardingDone: obj.onboardingDone === true,
    slicer: isSlicerId(obj.slicer) ? obj.slicer : DEFAULT_SETTINGS.slicer,
    defaultPreset: isSearchPresetId(obj.defaultPreset) ? obj.defaultPreset : DEFAULT_SETTINGS.defaultPreset,
  };
}

export function buildSlicerLink(slicer: SlicerId, fileUrl: string): string | null {
  const scheme = SLICERS[slicer].scheme;
  if (!scheme) return null;
  return `${scheme}://open?file=${encodeURIComponent(fileUrl)}`;
}

const VALID_SLICER_LINK_RE = /^(?:orcaslicer|bambustudio|prusaslicer|elegooslicer):\/\/open\?file=/;

export function isValidSlicerLink(link: string): boolean {
  return VALID_SLICER_LINK_RE.test(link);
}

/** Returns platforms that should be disabled for the chosen onboarding/search preset. */
export function disabledPlatformsForPreset(preset: SearchPresetId, available: Platform[]): Platform[] {
  if (preset === "all") return [];
  if (preset === "printing") {
    return available.filter((p) => {
      const g = PLATFORMS[p].group;
      return g !== "community" && g !== "brand" && g !== "more";
    });
  }
  if (preset === "cad") {
    return available.filter((p) => PLATFORMS[p].group !== "cad");
  }
  if (preset === "assets") {
    return available.filter((p) => PLATFORMS[p].group !== "general");
  }
  if (preset === "fast") {
    return available.filter((p) => PLATFORMS[p].browser);
  }
  return [];
}

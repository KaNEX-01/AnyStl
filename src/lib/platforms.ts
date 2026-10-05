import { Platform } from "./types";

export type GroupId = "community" | "brand" | "cad" | "general" | "more";

export interface GroupInfo {
  id: GroupId;
  name: string;
  description: string;
}

/** Sites grouped by what they're for, in display order. */
export const GROUPS: GroupInfo[] = [
  { id: "community", name: "Community", description: "Free print models shared by makers" },
  { id: "brand", name: "Printer brands", description: "Libraries run by Bambu Lab, Creality and Anycubic" },
  { id: "cad", name: "CAD & engineering", description: "Parts, mechanisms and CAD designs" },
  { id: "general", name: "3D assets & Blender", description: "Blender, game and render models — not always print-ready" },
  { id: "more", name: "More via Yeggi", description: "Cults3D, MyMiniFactory, Gambody and others" },
];

export interface PlatformInfo {
  group: GroupId;
  name: string;
  /** Badge label shown on model cards. */
  label: string;
  /** Short description of what the Featured section shows for this site. */
  featuredLabel: string;
  /** The site's own search, offered as a link when AnyStl can't reach the site. */
  searchUrl?: (query: string) => string;
  /** The site's "filament" colour: badge dot, card strip and filter swatch. */
  color: string;
}

export const PLATFORMS: Record<Platform, PlatformInfo> = {
  makerworld: {
    group: "brand",
    name: "MakerWorld",
    label: "MAKERWORLD",
    featuredLabel: "Popular",
    searchUrl: (q) => `https://makerworld.com/en/search/models?keyword=${encodeURIComponent(q)}`,
    color: "#4ADE80",
  },
  thingiverse: {
    group: "community",
    name: "Thingiverse",
    label: "THINGIVERSE",
    featuredLabel: "Popular",
    searchUrl: (q) => `https://www.thingiverse.com/search?q=${encodeURIComponent(q)}&type=things`,
    color: "#60A5FA",
  },
  printables: {
    group: "community",
    name: "Printables",
    label: "PRINTABLES",
    featuredLabel: "Trending this week",
    color: "#FB923C",
  },
  creality: {
    group: "brand",
    name: "Creality Cloud",
    label: "CREALITY",
    featuredLabel: "Recommended",
    color: "#2DD4BF",
  },
  makeronline: {
    group: "brand",
    name: "Makeronline",
    label: "MAKERONLINE",
    featuredLabel: "Trending",
    color: "#38BDF8",
  },
  sketchfab: {
    group: "general",
    name: "Sketchfab",
    label: "SKETCHFAB",
    featuredLabel: "Staff picks",
    color: "#A5B4FC",
  },
  grabcad: {
    group: "cad",
    name: "GrabCAD",
    label: "GRABCAD",
    featuredLabel: "Popular",
    color: "#A3E635",
  },
  tinkercad: {
    group: "cad",
    name: "Tinkercad",
    label: "TINKERCAD",
    featuredLabel: "Staff picks",
    color: "#FB7185",
  },
  pinshape: {
    group: "community",
    name: "Pinshape",
    label: "PINSHAPE",
    featuredLabel: "Popular",
    color: "#E879F9",
  },
  thangs: {
    group: "community",
    name: "Thangs",
    label: "THANGS",
    featuredLabel: "Popular",
    searchUrl: (q) => `https://thangs.com/search/${encodeURIComponent(q)}?scope=all`,
    color: "#22D3EE",
  },
  cgtrader: {
    group: "general",
    name: "CGTrader",
    label: "CGTRADER",
    featuredLabel: "Free models",
    searchUrl: (q) => `https://www.cgtrader.com/search?keywords=${encodeURIComponent(q)}`,
    color: "#FDBA74",
  },
  blenderkit: {
    group: "general",
    name: "BlenderKit",
    label: "BLENDERKIT",
    featuredLabel: "Top rated",
    color: "#FCD34D",
  },
  blendswap: {
    group: "general",
    name: "Blend Swap",
    label: "BLEND SWAP",
    featuredLabel: "Popular",
    color: "#F87171",
  },
  polyhaven: {
    group: "general",
    name: "Poly Haven",
    label: "POLY HAVEN",
    featuredLabel: "Newest",
    color: "#C084FC",
  },
  warehouse3d: {
    group: "general",
    name: "3D Warehouse",
    label: "3D WAREHOUSE",
    featuredLabel: "Most popular",
    color: "#CBD5E1",
  },
  myminifactory: {
    group: "community",
    name: "MyMiniFactory",
    label: "MYMINIFACTORY",
    featuredLabel: "Newest",
    searchUrl: (q) => `https://www.myminifactory.com/search?query=${encodeURIComponent(q)}`,
    color: "#7DD3FC",
  },
  turbosquid: {
    group: "general",
    name: "TurboSquid",
    label: "TURBOSQUID",
    featuredLabel: "Free models",
    searchUrl: (q) => `https://www.turbosquid.com/Search/3D-Models/${encodeURIComponent(q)}`,
    color: "#93C5FD",
  },
  free3d: {
    group: "general",
    name: "Free3D",
    label: "FREE3D",
    featuredLabel: "Latest",
    searchUrl: (q) => `https://free3d.com/3d-models/${encodeURIComponent(q.trim().replace(/\s+/g, "-"))}`,
    color: "#86EFAC",
  },
  cadnav: {
    group: "general",
    name: "CadNav",
    label: "CADNAV",
    featuredLabel: "Latest",
    color: "#D6D3D1",
  },
  nexprint: {
    group: "community",
    name: "Nexprint",
    label: "NEXPRINT",
    featuredLabel: "Recommended",
    color: "#34D399",
  },
  yeggi: {
    group: "more",
    name: "Yeggi",
    label: "YEGGI",
    featuredLabel: "Popular on Cults3D, MyMiniFactory & more",
    searchUrl: (q) => `https://www.yeggi.com/q/${encodeURIComponent(q.trim().replace(/\s+/g, "+")).replace(/%2B/g, "+")}/`,
    color: "#FACC15",
  },
};

/** All platforms, ordered by group. */
export const PLATFORM_ORDER = GROUPS.flatMap((g) =>
  (Object.keys(PLATFORMS) as Platform[]).filter((p) => PLATFORMS[p].group === g.id),
);

export function platformsInGroup(group: GroupId): Platform[] {
  return PLATFORM_ORDER.filter((p) => PLATFORMS[p].group === group);
}

/**
 * Sites AnyStl can't search directly (they require solving a CAPTCHA), offered
 * as links that run the same search in the user's own browser.
 */
export const EXTERNAL_SEARCHES: Array<{ name: string; url: (query: string) => string }> = [
  { name: "Cults3D", url: (q) => `https://cults3d.com/en/search?q=${encodeURIComponent(q)}` },
  { name: "Fab", url: (q) => `https://www.fab.com/search?q=${encodeURIComponent(q)}` },
  { name: "STLFinder", url: (q) => `https://www.stlfinder.com/3dmodels/${encodeURIComponent(q.trim().replace(/\s+/g, "-"))}/` },
];

/** Sites whose files anyone can download, so "Open in OrcaSlicer" works for them. */
export const SLICER_PLATFORMS: Platform[] = ["printables", "thingiverse"];

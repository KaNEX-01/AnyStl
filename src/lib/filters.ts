import { ModelResult, Platform } from "./types";
import { isModelFormat, ModelFormat } from "./modelFormats";

export type FormatFilter = ModelFormat | "unknown" | null;
export type LicenseFilter = "commercial" | "noncommercial" | "unknown" | null;

export function parseFormatFilter(value: string | null): FormatFilter {
  return value === "unknown" || isModelFormat(value) ? value : null;
}

export function parseLicenseFilter(value: string | null): LicenseFilter {
  return value === "commercial" || value === "noncommercial" || value === "unknown" ? value : null;
}

export interface ResultFilters {
  freeOnly: boolean;
  hideAI: boolean;
  /** Highest price in dollars; free models always pass. */
  maxPrice: number | null;
  /** Show the same model found on several sites as one card. */
  mergeDuplicates: boolean;
  format: FormatFilter;
  license: LicenseFilter;
}

export const DEFAULT_FILTERS: ResultFilters = {
  freeOnly: false,
  hideAI: false,
  maxPrice: null,
  mergeDuplicates: true,
  format: null,
  license: null,
};

/**
 * Sites that sell models, so a result without a price label isn't
 * necessarily free. Yeggi is here because it lists Cults3D / Gambody too.
 */
const MARKETPLACES = new Set<Platform>(["cgtrader", "cults3d", "turbosquid", "free3d", "blenderkit", "yeggi"]);

export function isFree(m: ModelResult): boolean {
  if (m.price) return m.price === "Free";
  return !MARKETPLACES.has(m.platform);
}

/** "$9.99" → 9.99, "Free" → 0, "Full Plan" → null. */
function priceValue(m: ModelResult): number | null {
  if (isFree(m)) return 0;
  const match = m.price?.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

/**
 * Splits "dragon -articulated -flexi" into the words sent to the sites and
 * the words results must not contain.
 */
export function parseQuery(raw: string): { search: string; excludes: string[] } {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  const excludes = words.filter((w) => w.length > 1 && w.startsWith("-")).map((w) => w.slice(1).toLowerCase());
  const search = words.filter((w) => !(w.length > 1 && w.startsWith("-"))).join(" ");
  return { search, excludes };
}

export function applyFilters(results: ModelResult[], filters: ResultFilters, excludes: string[]): ModelResult[] {
  return results.filter((m) => {
    if (filters.hideAI && m.isAI) return false;
    if (filters.freeOnly && !isFree(m)) return false;
    if (filters.format === "unknown" && m.formats?.length) return false;
    if (filters.format && filters.format !== "unknown" && !m.formats?.includes(filters.format)) return false;
    if (filters.license && !matchesLicense(m.license, filters.license)) return false;
    if (filters.maxPrice !== null) {
      const price = priceValue(m);
      if (price === null || price > filters.maxPrice) return false;
    }
    if (excludes.length > 0) {
      const title = m.title.toLowerCase();
      if (excludes.some((w) => title.includes(w))) return false;
    }
    return true;
  });
}

function matchesLicense(license: string | undefined, filter: NonNullable<LicenseFilter>): boolean {
  const name = license?.trim().toUpperCase().replace(/[-\s]+/g, " ");
  if (filter === "unknown") return !name;
  if (!name) return false;
  const ccBy = /^CC (?:BY|ATTRIBUTION)\b/.test(name);
  if (filter === "noncommercial") return ccBy && /\b(?:NC|NONCOMMERCIAL|NON COMMERCIAL)\b/.test(name);
  // Only recognized permissive CC labels. Do not infer rights from price or unknown terms.
  return /^(?:CC ?0(?: 1\.0)?|CC (?:BY|ATTRIBUTION)(?: SA| SHAREALIKE| SHARE ALIKE)?(?: [1-4]\.\d)?)(?: INTERNATIONAL)?$/.test(name);
}

// Words that say nothing about which model it is.
const FILLER = new Set([
  "a", "an", "the", "for", "and", "of", "with", "stl", "stls", "3d", "print", "printed", "printable",
  "printing", "model", "models", "file", "files", "free", "fdm", "resin",
]);

/** A title reduced to the words that identify the model, or null if too vague to match on. */
function titleKey(title: string): string | null {
  const words = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !FILLER.has(w));
  const key = words.join(" ");
  // "Vase" or "Phone stand" alone are different models on every site.
  return words.length >= 2 && key.length >= 10 ? key : null;
}

/**
 * Folds results with the same distinctive title from *different* sites into
 * the first one (in the current sort order); the others become its
 * `alternates`. Two same-titled models on one site are kept apart.
 */
export function mergeDuplicates(results: ModelResult[]): ModelResult[] {
  const groups = new Map<string, Array<{ index: number; sites: Set<string> }>>();
  const out: ModelResult[] = [];
  const site = (m: ModelResult) => m.via?.toLowerCase() || m.platform;

  for (const m of results) {
    const key = titleKey(m.title);
    if (!key) {
      out.push(m);
      continue;
    }
    const candidates = groups.get(key);
    const group = candidates?.find((g) => !g.sites.has(site(m)) && !g.sites.has(m.platform));
    if (group) {
      group.sites.add(site(m)).add(m.platform);
      const current = out[group.index]!;
      if (current.alternates) {
        current.alternates.push(m);
      } else {
        out[group.index] = { ...current, alternates: [m] };
      }
      continue;
    }
    const entry = { index: out.length, sites: new Set([site(m), m.platform]) };
    if (candidates) candidates.push(entry);
    else groups.set(key, [entry]);
    out.push(m);
  }
  return out;
}

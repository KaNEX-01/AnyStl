import { ModelResult, Platform, SiteCheck, SiteHealth } from "./types";

// How each site has been doing since AnyStl started: every search, Featured
// load and health check adds an entry. Kept in memory only.

const KEEP = 20;
const history = new Map<Platform, SiteCheck[]>();

/**
 * Signs that a scraper is reading the wrong part of the page: results come
 * back, but without the fields every result of that site should have.
 */
function qualityWarnings(results: ModelResult[]): string[] {
  if (!results.length) return [];
  const share = (pred: (r: ModelResult) => boolean) => results.filter(pred).length / results.length;
  const warnings: string[] = [];
  if (share((r) => !r.thumbnail) > 0.5) warnings.push("most results have no image");
  if (share((r) => r.title.trim().length < 3) > 0.2) warnings.push("titles look empty or broken");
  if (share((r) => !/^https?:\/\//.test(r.url)) > 0) warnings.push("some links are invalid");
  if (new Set(results.map((r) => r.url)).size < results.length * 0.8) warnings.push("many duplicate links");
  return warnings;
}

export function recordOutcome(
  platform: Platform,
  kind: SiteCheck["kind"],
  ms: number,
  outcome: { results: ModelResult[] } | { error: unknown },
): SiteCheck {
  const entry: SiteCheck =
    "error" in outcome
      ? {
          at: Date.now(),
          kind,
          ms,
          status: "failed",
          count: 0,
          error: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
        }
      : {
          at: Date.now(),
          kind,
          ms,
          status: outcome.results.length ? "ok" : "empty",
          count: outcome.results.length,
          warnings: qualityWarnings(outcome.results),
        };
  const list = history.get(platform) || [];
  list.unshift(entry);
  history.set(platform, list.slice(0, KEEP));
  return entry;
}

export function siteHealth(blockedUntil: (p: Platform) => number): SiteHealth[] {
  return [...history.keys()].map((platform) => ({
    platform,
    recent: history.get(platform)!,
    blockedUntil: blockedUntil(platform) || undefined,
  }));
}

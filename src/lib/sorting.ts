import { ModelResult, Platform, SortOption } from "./types";

/**
 * Each result's percentile (0–1) among the results from its own site.
 *
 * Raw like/download counts aren't comparable across sites: a Thingiverse
 * hit has 100× the likes of a GrabCAD one. Ranking every result against its
 * own site instead lets the best of each site rise together. Sites that
 * report no counts at all fall back to their own search order.
 */
function sitePercentiles(results: ModelResult[]): Map<ModelResult, number> {
  const bySite = new Map<Platform, ModelResult[]>();
  for (const r of results) bySite.set(r.platform, [...(bySite.get(r.platform) || []), r]);

  const pct = new Map<ModelResult, number>();
  for (const list of bySite.values()) {
    const n = list.length;
    if (list.every((r) => r.score === list[0]!.score)) {
      list.forEach((r, i) => pct.set(r, 1 - (i + 0.5) / n));
      continue;
    }
    const asc = [...list].sort((a, b) => a.score - b.score);
    // Equal scores share the middle of their rank range.
    for (let i = 0; i < n; ) {
      let j = i;
      while (j + 1 < n && asc[j + 1]!.score === asc[i]!.score) j++;
      const p = ((i + j) / 2 + 0.5) / n;
      for (let k = i; k <= j; k++) pct.set(asc[k]!, p);
      i = j + 1;
    }
  }
  return pct;
}

function fairSort<T extends ModelResult>(results: T[]): T[] {
  const pct = sitePercentiles(results);
  // Position within its own site, so ties keep each site's own order.
  const siteIndex = new Map<ModelResult, number>();
  const seen = new Map<Platform, number>();
  for (const r of results) {
    const i = seen.get(r.platform) || 0;
    siteIndex.set(r, i);
    seen.set(r.platform, i + 1);
  }
  return [...results].sort(
    (a, b) =>
      pct.get(b)! - pct.get(a)! ||
      siteIndex.get(a)! - siteIndex.get(b)! ||
      b.score - a.score,
  );
}

/**
 * Sort results by the chosen option.
 *
 * Thingiverse has null downloads — when sorting by downloads we treat null as 0,
 * but use likes as a secondary sort so Thingiverse results don't randomly cluster.
 */
export function sortResults<T extends ModelResult>(results: T[], sort: SortOption): T[] {
  if (sort === "newest") return results; // stored newest-first
  if (sort === "fair") return fairSort(results);

  const sorted = [...results];

  sorted.sort((a, b) => {
    switch (sort) {
      case "likes-desc":
        return b.likes - a.likes;
      case "likes-asc":
        return a.likes - b.likes;
      case "downloads-desc": {
        const da = a.downloads ?? 0;
        const db = b.downloads ?? 0;
        if (db !== da) return db - da;
        return b.likes - a.likes; // secondary: likes desc
      }
      case "downloads-asc": {
        const da = a.downloads ?? 0;
        const db = b.downloads ?? 0;
        if (da !== db) return da - db;
        return a.likes - b.likes; // secondary: likes asc
      }
      default:
        return 0;
    }
  });

  return sorted;
}

export const SORT_OPTIONS: SortOption[] = ["fair", "likes-desc", "likes-asc", "downloads-desc", "downloads-asc"];

export function isSortOption(value: string | null): value is SortOption {
  return !!value && (SORT_OPTIONS as string[]).includes(value);
}

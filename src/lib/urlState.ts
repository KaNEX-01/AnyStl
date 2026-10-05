import { DEFAULT_FILTERS, ResultFilters } from "./filters";
import { isSortOption } from "./sorting";
import { SortOption } from "./types";

// The search page keeps its query, sort and filters in the address bar, so a
// reload or the back button returns to the same results and links can be shared.

export interface UrlState {
  query: string;
  sort: SortOption;
  filters: ResultFilters;
}

export function readUrlState(): UrlState {
  const p = new URLSearchParams(window.location.search);
  const max = Number(p.get("max"));
  const sort = p.get("sort");
  return {
    query: p.get("q")?.trim() || "",
    sort: isSortOption(sort) ? sort : "fair",
    filters: {
      freeOnly: p.get("free") === "1",
      hideAI: p.get("noai") === "1",
      maxPrice: p.has("max") && Number.isFinite(max) && max >= 0 ? max : null,
      mergeDuplicates: p.get("merge") !== "0",
    },
  };
}

export function urlFor({ query, sort, filters }: UrlState): string {
  const p = new URLSearchParams();
  if (query) p.set("q", query);
  if (sort !== "fair") p.set("sort", sort);
  if (filters.freeOnly) p.set("free", "1");
  if (filters.hideAI) p.set("noai", "1");
  if (filters.maxPrice !== null) p.set("max", String(filters.maxPrice));
  if (filters.mergeDuplicates !== DEFAULT_FILTERS.mergeDuplicates) p.set("merge", "0");
  const qs = p.toString();
  return qs ? `/?${qs}` : "/";
}

/** Updates the address bar; `push` adds a history entry (new searches), otherwise it's replaced. */
export function writeUrlState(state: UrlState, push: boolean) {
  const url = urlFor(state);
  if (url === window.location.pathname + window.location.search) return;
  if (push) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

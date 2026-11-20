"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { ModelGrid } from "@/components/ModelGrid";
import { SearchHistory, addToHistory } from "@/components/SearchHistory";
import { SortDropdown } from "@/components/SortDropdown";
import { ColumnSlider } from "@/components/ColumnSlider";
import { ExternalSearchLinks } from "@/components/ExternalSearchLinks";
import { FilterBar } from "@/components/FilterBar";
import { LogoLoader } from "@/components/LogoLoader";
import { sortResults } from "@/lib/sorting";
import { applyFilters, DEFAULT_FILTERS, mergeDuplicates, parseQuery, ResultFilters } from "@/lib/filters";
import { streamSearch } from "@/lib/searchStream";
import { readUrlState, writeUrlState } from "@/lib/urlState";
import { onSourcesChanged, useSourceFilter } from "@/lib/useSourceFilter";
import { setSearchProgress, SourceState } from "@/lib/useResultCounts";
import { ModelResult, Platform, SearchStreamEvent, SortOption } from "@/lib/types";

const SUGGESTIONS = ["benchy", "articulated dragon", "gridfinity", "phone stand", "cable clip"];

type States = Partial<Record<Platform, SourceState>>;

export default function Home() {
  // Results per loaded page, so "best of each site" ranks within a page and
  // models loaded by scrolling are added below instead of reshuffling above.
  const [pages, setPages] = useState<ModelResult[][]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [searchTime, setSearchTime] = useState<number>(0);
  const [sortBy, setSortBy] = useState<SortOption>("fair");
  const [filters, setFilters] = useState<ResultFilters>(DEFAULT_FILTERS);
  const [columns, setColumns] = useState(4);
  // The query as typed, including "-word" exclusions.
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [activeSources, setActiveSources] = useState<Platform[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [states, setStates] = useState<States>({});
  const [errors, setErrors] = useState<Partial<Record<Platform, string>>>({});
  // Cancels the stream of a search that's been replaced by a newer one.
  const abortRef = useRef<AbortController | null>(null);
  // Read by the sidebar-filter subscription below, which outlives renders.
  const queryRef = useRef("");
  const searchedSourcesRef = useRef<Platform[]>([]);
  const seenUrlsRef = useRef(new Set<string>());

  const { available, enabled } = useSourceFilter();
  const { excludes } = useMemo(() => parseQuery(query), [query]);

  const allResults = useMemo(() => pages.flat(), [pages]);
  const shownResults = useMemo(() => {
    const visible = (list: ModelResult[]) =>
      applyFilters(list.filter((r) => enabled.includes(r.platform)), filters, excludes);
    const sorted =
      sortBy === "fair"
        ? pages.flatMap((p) => sortResults(visible(p), "fair"))
        : sortResults(visible(allResults), sortBy);
    return filters.mergeDuplicates ? mergeDuplicates(sorted) : sorted;
  }, [pages, allResults, enabled, filters, excludes, sortBy]);

  const platformCounts = useMemo(
    () =>
      allResults.reduce<Partial<Record<Platform, number>>>((acc, r) => {
        acc[r.platform] = (acc[r.platform] || 0) + 1;
        return acc;
      }, {}),
    [allResults],
  );
  const failedSources = useMemo(
    () => enabled.filter((p) => states[p] === "failed"),
    [states, enabled],
  );
  // TraceParts only covers the configured catalog. Offer its wider search if
  // there were no catalog matches, but not just because the next page is empty.
  const searchedPlatforms = enabled.filter((p) => p === "traceparts"
    ? !!platformCounts[p]
    : (states[p] === "ok" || states[p] === "empty"));
  const pendingCount = Object.values(states).filter((s) => s === "pending").length;
  const answeredCount = Object.keys(states).length - pendingCount;

  // Let the server get past sites' bot checks while the user is still typing.
  useEffect(() => {
    fetch("/api/warmup", { method: "POST" }).catch(() => {});
  }, []);

  // Show per-site progress next to each site in the sidebar filter.
  useEffect(() => {
    setSearchProgress(searched ? { counts: platformCounts, states, errors } : null);
  }, [searched, platformCounts, states, errors]);
  useEffect(() => () => setSearchProgress(null), []);

  // Sort and filter changes rewrite the address bar without a new history entry.
  useEffect(() => {
    if (queryRef.current) writeUrlState({ query: queryRef.current, sort: sortBy, filters }, false);
  }, [sortBy, filters]);

  /** Streams one page of results, adding each site's models as they come. */
  const runPage = async (
    search: string,
    pageNo: number,
    sources: Platform[],
    controller: AbortController,
    onSource: (e: Extract<SearchStreamEvent, { type: "source" }>, fresh: ModelResult[]) => void,
  ) => {
    setStates((prev) => ({ ...prev, ...Object.fromEntries(sources.map((p) => [p, "pending"])) }));
    const all = sources.length === available.length;
    await streamSearch(
      search,
      pageNo,
      all ? undefined : sources,
      (event) => {
        if (controller.signal.aborted) return;
        if (event.type === "error") throw new Error(event.error);
        if (event.type !== "source") return;
        const fresh = event.results.filter((r) => !seenUrlsRef.current.has(r.url));
        fresh.forEach((r) => seenUrlsRef.current.add(r.url));
        if (fresh.length) {
          setPages((prev) => {
            const next = [...prev];
            next[pageNo - 1] = [...(next[pageNo - 1] || []), ...fresh];
            return next;
          });
        }
        setStates((prev) => ({ ...prev, [event.platform]: event.status }));
        if (event.error) setErrors((prev) => ({ ...prev, [event.platform]: event.error }));
        onSource(event, fresh);
      },
      controller.signal,
    );
    // Anything the stream never reported (it broke off) counts as failed.
    setStates((prev) =>
      Object.fromEntries(Object.entries(prev).map(([p, s]) => [p, s === "pending" ? "failed" : s])) as States,
    );
  };

  const handleSearch = async (raw: string, sources: Platform[] = enabled, push = true) => {
    const { search } = parseQuery(raw);
    if (!search) {
      setError("Add at least one word to search for; “-word” only removes results.");
      setSearched(true);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    setMoreError(null);
    setSearched(true);
    setQuery(raw);
    queryRef.current = raw;
    searchedSourcesRef.current = sources;
    seenUrlsRef.current = new Set();
    setPages([]);
    setPage(1);
    setStates({});
    setErrors({});
    setActiveSources([]);
    writeUrlState({ query: raw, sort: sortBy, filters }, push);
    addToHistory(raw);
    const start = performance.now();

    const exhausted = new Set<Platform>();
    try {
      await runPage(search, 1, sources, controller, (event) => {
        if (event.status === "empty") exhausted.add(event.platform);
      });
      if (controller.signal.aborted) return;
      setActiveSources(sources.filter((p) => !exhausted.has(p)));
      setSearchTime((performance.now() - start) / 1000);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (abortRef.current === controller) setIsLoading(false);
    }
  };

  // The sidebar filter lives outside this page: when it switches on a site
  // the current results didn't include, search again with it.
  const handleSearchRef = useRef(handleSearch);
  useEffect(() => {
    handleSearchRef.current = handleSearch;
  });
  useEffect(
    () =>
      onSourcesChanged(available, (next) => {
        const q = queryRef.current;
        if (q && next.some((p) => !searchedSourcesRef.current.includes(p))) handleSearchRef.current(q, next, false);
      }),
    [available],
  );

  // Open the search in the address bar on load, and follow back / forward.
  useEffect(() => {
    const restore = () => {
      const state = readUrlState();
      setSortBy(state.sort);
      setFilters(state.filters);
      if (state.query && state.query !== queryRef.current) {
        handleSearchRef.current(state.query, undefined, false);
      } else if (!state.query && queryRef.current) {
        abortRef.current?.abort();
        queryRef.current = "";
        setQuery("");
        setSearched(false);
        setPages([]);
        setStates({});
        setError(null);
        setIsLoading(false);
      }
    };
    // After hydration settles, so the saved site selection is already read.
    const first = setTimeout(restore, 0);
    window.addEventListener("popstate", restore);
    return () => {
      clearTimeout(first);
      window.removeEventListener("popstate", restore);
    };
  }, []);

  const handleLoadMore = async () => {
    const controller = abortRef.current;
    if (!controller) return;
    const sources = activeSources.filter((p) => enabled.includes(p));
    const nextPage = page + 1;
    setLoadingMore(true);
    setMoreError(null);
    // A source is done when it reports no results, or only repeats ones we
    // have (some sites keep returning their last page past the end).
    // Sources that merely errored stay, so the next try asks them again.
    const done = new Set<Platform>();
    try {
      await runPage(parseQuery(query).search, nextPage, sources, controller, (event, fresh) => {
        if (event.status === "empty" || (event.status === "ok" && fresh.length === 0)) done.add(event.platform);
      });
      if (controller.signal.aborted) return;
      setPage(nextPage);
      setActiveSources((prev) => prev.filter((p) => !done.has(p)));
    } catch (err) {
      if (!controller.signal.aborted) setMoreError(err instanceof Error ? err.message : "Couldn't load more");
    } finally {
      if (abortRef.current === controller) setLoadingMore(false);
    }
  };

  const canLoadMore = !isLoading && activeSources.some((p) => enabled.includes(p));

  // Infinite scroll: load the next page when the end of the grid comes into view.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(handleLoadMore);
  useEffect(() => {
    loadMoreRef.current = handleLoadMore;
  });
  const autoLoad = canLoadMore && !loadingMore && !moreError;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !autoLoad) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMoreRef.current(), {
      rootMargin: "1200px 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [autoLoad, shownResults.length]);

  const hasResults = shownResults.length > 0;
  const hiddenByFilters = allResults.length > 0 && !hasResults;

  return (
    <main className="flex flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-10 lg:py-7">
      <SearchBar onSearch={(q) => handleSearch(q)} isLoading={isLoading} initialQuery={query} />

      {/* Before the first search */}
      {!searched && !isLoading && (
        <section className="flex flex-col gap-6 pt-6 lg:pt-12">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-bold tracking-tight text-spool-text sm:text-5xl">What are you printing today?</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-spool-muted">
              One search across {available.length} model sites: printing communities, printer-brand libraries, CAD
              collections and Blender / 3D asset stores. Pick which ones to load from the spools on the left. Add
              <span className="font-mono text-spool-text"> -word </span>to leave out results containing a word.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-spool-dim">Try</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSearch(s)}
                className="rounded-full border border-spool-line px-3.5 py-1.5 text-sm text-spool-text transition-colors hover:border-spool-accent hover:text-spool-accent-soft"
              >
                {s}
              </button>
            ))}
          </div>
          <SearchHistory onSelect={(q) => handleSearch(q)} />
        </section>
      )}

      {/* Nothing has arrived yet */}
      {isLoading && allResults.length === 0 && (
        <div role="status" className="flex flex-col items-center justify-center gap-5 py-24 text-spool-muted">
          <LogoLoader size={88} />
          <p className="text-sm">
            Searching {enabled.length === available.length ? "all" : enabled.length} sites...
            {answeredCount > 0 && <span className="font-mono text-xs text-spool-dim"> {answeredCount} answered</span>}
          </p>
        </div>
      )}

      {error && !isLoading && allResults.length > 0 && <p className="py-20 text-center text-sm text-[#FCA5A5]">{error}</p>}

      {!isLoading && searched && allResults.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          {error ? <p className="text-sm text-[#FCA5A5]">{error}</p>
            : <p className="text-sm text-spool-muted">No results found. Try a different search term.</p>}
          <ExternalSearchLinks query={parseQuery(query).search} failed={failedSources} searched={searchedPlatforms} />
        </div>
      )}

      {allResults.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <p className="text-[15px] text-spool-muted">
                <span className="font-semibold text-spool-text">{shownResults.length} models</span>
                {isLoading ? (
                  <span className="ml-2 inline-flex items-center gap-2 font-mono text-xs">
                    <LogoLoader size={16} />
                    {answeredCount}/{answeredCount + pendingCount} sites
                  </span>
                ) : (
                  <> · {searchTime.toFixed(1)} s</>
                )}
              </p>
              <span className="flex-grow" />
              <SortDropdown value={sortBy} onChange={setSortBy} />
              <div className="hidden lg:flex">
                <ColumnSlider value={columns} onChange={setColumns} />
              </div>
            </div>
            <FilterBar value={filters} onChange={setFilters} excludes={excludes} />
            {!isLoading && <ExternalSearchLinks query={parseQuery(query).search} failed={failedSources} searched={searchedPlatforms} />}
          </div>

          {hiddenByFilters && (
            <p className="py-12 text-center text-sm text-spool-muted">
              All {allResults.length} results are hidden by the filters above.
            </p>
          )}

          {hasResults && <ModelGrid models={shownResults} columns={columns} />}

          <div ref={sentinelRef} className="flex flex-col items-center gap-2 pt-4">
            {loadingMore ? (
              <span className="inline-flex items-center gap-2 text-sm text-spool-muted">
                <LogoLoader size={20} /> Loading more…
              </span>
            ) : moreError ? (
              <>
                <p className="text-xs text-[#FCA5A5]">{moreError}</p>
                <button
                  onClick={handleLoadMore}
                  className="inline-flex h-11 items-center rounded-[14px] border border-spool-line bg-spool-field px-6 text-sm font-semibold text-spool-text hover:border-spool-accent"
                >
                  Try again
                </button>
              </>
            ) : (
              !isLoading && !canLoadMore && <p className="font-mono text-xs text-spool-dim">No more results from any site.</p>
            )}
          </div>
        </>
      )}

      <footer className="mt-auto pt-10 text-center font-mono text-[11px] text-spool-dim">
        AnyStl · 3D model meta-search · not affiliated with any of the searched sites
        {available.includes("traceparts") && (
          <>
            {" · CAD catalog "}
            <a href="https://www.traceparts.com/" target="_blank" rel="noopener noreferrer" className="underline">
              powered by TraceParts
            </a>
          </>
        )}
      </footer>
    </main>
  );
}

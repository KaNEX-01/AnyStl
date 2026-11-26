"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { alternativeQuery, findAlternatives } from "@/lib/modelAlternatives";
import { DEFAULT_FILTERS } from "@/lib/filters";
import { streamSearch } from "@/lib/searchStream";
import { urlFor } from "@/lib/urlState";
import { useSourceFilter } from "@/lib/useSourceFilter";
import { recordViewed } from "@/lib/useViewed";
import type { ModelResult, Platform, SavedModel } from "@/lib/types";
import { CompareButton } from "./CompareButton";
import { ExternalSearchLinks } from "./ExternalSearchLinks";
import { LogoLoader } from "./LogoLoader";
import { ModelDialog } from "./ModelDialog";
import { PlatformBadge } from "./PlatformIcon";

export function AlternativesDialog({ model, deadUrls, onClose }: { model: SavedModel; deadUrls: string[]; onClose: () => void }) {
  const { enabled } = useSourceFilter();
  const [sources] = useState(() => enabled.filter((platform) => platform !== model.platform));
  const query = alternativeQuery(model.title);
  const [results, setResults] = useState<ModelResult[]>([]);
  const [failed, setFailed] = useState<Platform[]>([]);
  const [searched, setSearched] = useState<Platform[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!query || !sources.length) return;
    const controller = new AbortController();
    let finished = false;
    void streamSearch(query, 1, sources, (event) => {
      if (controller.signal.aborted) return;
      if (event.type === "error") throw new Error(event.error);
      if (event.type === "done") finished = true;
      if (event.type !== "source") return;
      if (event.status === "failed") setFailed((prev) => [...prev, event.platform]);
      else {
        setSearched((prev) => [...prev, event.platform]);
        if (event.results.length) setResults((prev) => [...prev, ...event.results]);
      }
    }, controller.signal).then(() => {
      if (!finished && !controller.signal.aborted) setError(true);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setDone(true);
    });
    return () => controller.abort();
  }, [sources, query]);

  const alternatives = findAlternatives(model, results, deadUrls);
  const canSearch = !!query && sources.length > 0;
  const loading = canSearch && !done;

  return (
    <ModelDialog title="Find alternatives" onClose={onClose}>
      <p className="mb-1 font-medium">{model.title}</p>
      <p className="mb-4 text-sm text-spool-muted">Possible matches from other sites, ranked by title. Check the model and license before using it. Your saved entry stays unchanged.</p>

      {loading && <p role="status" className="mb-3 flex items-center gap-2 text-sm text-spool-muted"><LogoLoader size={20} /> Searching other sites…</p>}
      {!canSearch && <p className="mb-3 text-sm text-spool-muted">{query ? "No other search sites are enabled. Open full search to change your site selection." : "There’s no usable title to search."}</p>}
      {done && !error && searched.length > 0 && !alternatives.length && (
        <p role="status" className="mb-3 text-sm text-spool-muted">No close title matches found on the first page of results.</p>
      )}
      {done && (error || failed.length > 0) && (
        <p role="status" className="mb-3 text-sm text-spool-muted">{error || !searched.length ? "The search couldn’t finish. Try a full search or search directly on a provider’s site." : `${failed.length} site${failed.length === 1 ? "" : "s"} didn’t answer.`}</p>
      )}

      {!!alternatives.length && (
        <ul aria-label="Suggested models" className="mb-4 divide-y divide-spool-line rounded-xl border border-spool-line">
          {alternatives.map(({ model: candidate, match }) => (
            <li key={candidate.url} className="flex items-center gap-3 px-3 py-2.5">
              <a href={candidate.url} target="_blank" rel="noopener noreferrer" onClick={() => recordViewed(candidate)}
                className="min-w-0 flex-1 hover:text-spool-accent-soft">
                <span className="block break-words text-sm font-medium">{candidate.title} ↗</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-spool-muted">
                  <PlatformBadge platform={candidate.platform} via={candidate.via} />
                  {match === "title" ? "Matching title" : "Similar title"}
                  {candidate.formats?.length ? candidate.formats.join(", ") : null}
                </span>
              </a>
              <CompareButton model={candidate} />
            </li>
          ))}
        </ul>
      )}

      {query && (
        <div className="flex flex-col gap-2">
          <Link href={urlFor({ query, sort: "fair", filters: DEFAULT_FILTERS })} onClick={onClose}
            className="w-fit text-sm font-medium text-spool-accent-soft hover:underline">Open full search ↗</Link>
          {(done || !canSearch) && <ExternalSearchLinks query={query} failed={failed}
            searched={searched.filter((platform) => platform !== "traceparts" || alternatives.some(({ model }) => model.platform === platform))} />}
        </div>
      )}
    </ModelDialog>
  );
}

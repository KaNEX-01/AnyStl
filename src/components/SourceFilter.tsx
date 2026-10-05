"use client";

import { GROUPS, PLATFORMS, PLATFORM_ORDER, platformsInGroup } from "@/lib/platforms";
import { useSourceFilter } from "@/lib/useSourceFilter";
import { SearchProgress } from "@/lib/useResultCounts";
import { SpoolDot } from "./PlatformIcon";

interface Props {
  /** Per-site progress of the current search, shown next to each site. */
  progress?: SearchProgress | null;
}

/**
 * Sites grouped by purpose ("spools"); click a group to switch all of its
 * sites, or a single site. The search page reacts to changes itself.
 */
export function SourceFilter({ progress }: Props) {
  const { isEnabled, setEnabled, allEnabled, enableAll, enabled } = useSourceFilter();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs text-spool-muted">
          Spools · <span className="text-spool-text">{enabled.length}</span> of {PLATFORM_ORDER.length} loaded
        </p>
        {!allEnabled && (
          <button onClick={() => enableAll()} className="text-xs font-medium text-spool-accent-soft hover:text-spool-text">
            Select all
          </button>
        )}
      </div>

      {GROUPS.map((group) => {
        const sites = platformsInGroup(group.id);
        const on = sites.filter(isEnabled).length;
        const state = on === 0 ? "off" : on === sites.length ? "on" : "some";
        return (
          <div key={group.id} className="flex flex-col gap-2">
            <button
              onClick={() => setEnabled(sites, state !== "on")}
              aria-pressed={state === "on" ? true : state === "off" ? false : "mixed"}
              title={group.description}
              className="group/g flex items-start gap-2.5 text-left"
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                  state === "off" ? "border-spool-line" : "border-spool-accent bg-spool-accent"
                }`}
              >
                {state === "on" && (
                  <svg className="h-3 w-3 text-spool-side" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {state === "some" && <span className="h-0.5 w-2 rounded bg-spool-side" />}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${state === "off" ? "text-spool-dim" : "text-spool-text"} group-hover/g:text-white`}>
                  {group.name}
                </span>
                <span className="block text-[11px] leading-snug text-spool-dim">{group.description}</span>
              </span>
            </button>

            <div className="flex flex-wrap gap-1.5 pl-[26px]">
              {sites.map((p) => {
                const active = isEnabled(p);
                return (
                  <button
                    key={p}
                    onClick={() => setEnabled([p], !active)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2.5 text-xs transition-colors ${
                      active
                        ? "bg-spool-chip text-spool-text hover:bg-spool-line"
                        : "bg-transparent text-spool-dim line-through ring-1 ring-inset ring-spool-line-soft hover:text-spool-muted"
                    }`}
                  >
                    <SpoolDot platform={p} size={13} muted={!active} />
                    {PLATFORMS[p].name}
                    {active && progress?.states[p] === "pending" && (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-spool-accent" title="Searching…" />
                    )}
                    {active && progress?.states[p] === "failed" && (
                      <span className="font-mono text-[11px] text-[#FCA5A5]" title={progress.errors[p] || "Failed"}>
                        !
                      </span>
                    )}
                    {active && progress && (progress.states[p] === "ok" || progress.states[p] === "empty") && (
                      <span className="font-mono text-[11px] text-spool-muted">{progress.counts[p] ?? 0}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

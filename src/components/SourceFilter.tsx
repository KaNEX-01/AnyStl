"use client";

import { GROUPS, PLATFORMS } from "@/lib/platforms";
import type { Platform } from "@/lib/types";
import { useSourceFilter } from "@/lib/useSourceFilter";
import { SearchProgress } from "@/lib/useResultCounts";
import { SpoolDot } from "./PlatformIcon";

interface Props {
  /** Per-site progress of the current search, shown next to each site. */
  progress?: SearchProgress | null;
  platforms: Platform[];
}

const PRESETS: Array<{ id: string; label: string; title?: string; match: (p: Platform) => boolean }> = [
  { id: "all", label: "All", match: () => true },
  {
    id: "fast",
    label: "Fast (API)",
    title: "Only direct API and plain HTTP sites — skips slower browser-scraped sites",
    match: (p) => !PLATFORMS[p].browser,
  },
  { id: "print", label: "3D Printing", match: (p) => PLATFORMS[p].group === "community" || PLATFORMS[p].group === "brand" },
  { id: "cad", label: "CAD", match: (p) => PLATFORMS[p].group === "cad" },
  { id: "assets", label: "3D Assets", match: (p) => PLATFORMS[p].group === "general" },
];

/**
 * Sites grouped by purpose ("spools"); click a preset, a group to switch all
 * of its sites, or a single site. The search page reacts to changes itself.
 */
export function SourceFilter({ progress, platforms }: Props) {
  const { isEnabled, setEnabled } = useSourceFilter();
  const enabledCount = platforms.filter(isEnabled).length;

  const applyPreset = (match: (p: Platform) => boolean) => {
    const wanted = new Set(platforms.filter(match));
    const turnOn = platforms.filter((p) => wanted.has(p) && !isEnabled(p));
    const turnOff = platforms.filter((p) => !wanted.has(p) && isEnabled(p));
    if (turnOn.length) setEnabled(turnOn, true);
    if (turnOff.length) setEnabled(turnOff, false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs text-spool-muted">
          Spools · <span className="text-spool-text">{enabledCount}</span> of {platforms.length} loaded
        </p>
        {enabledCount !== platforms.length && (
          <button onClick={() => setEnabled(platforms, true)} className="text-xs font-medium text-spool-accent-soft hover:text-spool-text">
            Select all
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Source presets">
        {PRESETS.map((preset) => {
          const targets = platforms.filter(preset.match);
          if (!targets.length) return null;
          const active =
            enabledCount === targets.length && targets.every((p) => isEnabled(p));
          return (
            <button
              key={preset.id}
              type="button"
              title={preset.title}
              onClick={() => applyPreset(preset.match)}
              aria-pressed={active}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-spool-accent/15 text-spool-accent-soft ring-1 ring-inset ring-spool-accent/50"
                  : "bg-spool-chip text-spool-muted hover:text-spool-text"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {GROUPS.map((group) => {
        const sites = platforms.filter((p) => PLATFORMS[p].group === group.id);
        if (!sites.length) return null;
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

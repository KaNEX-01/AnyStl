"use client";

import { SortOption } from "@/lib/types";
import { SORT_OPTIONS } from "@/lib/sorting";

const LABELS: Record<SortOption, string> = {
  fair: "Best of each site",
  newest: "Newest saved",
  "likes-desc": "Most liked",
  "likes-asc": "Least liked",
  "downloads-desc": "Most downloaded",
  "downloads-asc": "Least downloaded",
};

interface Props {
  value: SortOption;
  onChange: (v: SortOption) => void;
  options?: SortOption[];
}

export function SortDropdown({ value, onChange, options = SORT_OPTIONS }: Props) {
  return (
    <label className="flex items-center gap-2 text-xs text-spool-muted">
      <span className="hidden sm:inline">Sort</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as SortOption)}
          className="cursor-pointer appearance-none rounded-full border border-spool-line-soft bg-spool-card/80 py-1.5 pl-3 pr-7 text-xs font-medium text-spool-text transition-colors hover:border-spool-line focus:border-spool-accent/70 focus:outline-none"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {LABELS[o]}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-spool-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </span>
    </label>
  );
}

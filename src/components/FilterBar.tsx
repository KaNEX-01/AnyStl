"use client";

import { useState } from "react";
import { ResultFilters } from "@/lib/filters";

interface Props {
  value: ResultFilters;
  onChange: (next: ResultFilters) => void;
  /** Words excluded with "-word" in the query, shown as a reminder. */
  excludes: string[];
}

function Toggle({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        on ? "bg-spool-accent text-spool-side" : "bg-spool-chip text-spool-muted hover:text-spool-text"
      }`}
    >
      {children}
    </button>
  );
}

/** Result filters: free only, no AI, price cap, merging the same model across sites. */
export function FilterBar({ value, onChange, excludes }: Props) {
  const set = (patch: Partial<ResultFilters>) => onChange({ ...value, ...patch });
  // The price box keeps its own text so typing "1." isn't rewritten mid-way.
  const [priceText, setPriceText] = useState(value.maxPrice === null ? "" : String(value.maxPrice));
  const [lastMax, setLastMax] = useState(value.maxPrice);
  if (value.maxPrice !== lastMax) {
    setLastMax(value.maxPrice);
    setPriceText(value.maxPrice === null ? "" : String(value.maxPrice));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Toggle on={value.freeOnly} onClick={() => set({ freeOnly: !value.freeOnly })} title="Hide paid models and marketplace results without a price">
        Free only
      </Toggle>
      <Toggle on={value.hideAI} onClick={() => set({ hideAI: !value.hideAI })} title="Hide models marked as AI-generated">
        Hide AI
      </Toggle>
      <Toggle
        on={value.mergeDuplicates}
        onClick={() => set({ mergeDuplicates: !value.mergeDuplicates })}
        title="Show the same model found on several sites as one card"
      >
        Merge duplicates
      </Toggle>
      <label
        className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1 text-xs font-medium ${
          value.maxPrice !== null ? "bg-spool-accent text-spool-side" : "bg-spool-chip text-spool-muted"
        }`}
      >
        Max $
        <input
          inputMode="decimal"
          value={priceText}
          placeholder="any"
          onChange={(e) => {
            const text = e.target.value.replace(/[^\d.]/g, "");
            setPriceText(text);
            const n = parseFloat(text);
            const next = text === "" || Number.isNaN(n) ? null : n;
            setLastMax(next);
            set({ maxPrice: next });
          }}
          className="w-14 rounded-full bg-spool-bg/60 px-2 py-0.5 text-spool-text placeholder:text-spool-dim focus:outline-none"
        />
      </label>
      {excludes.length > 0 && (
        <span className="font-mono text-[11px] text-spool-dim">
          without {excludes.map((w) => `“${w}”`).join(", ")}
        </span>
      )}
    </div>
  );
}

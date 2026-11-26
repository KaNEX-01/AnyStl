"use client";

import { COMPARE_LIMIT } from "@/lib/comparison";
import type { ModelResult } from "@/lib/types";
import { toggleCompareModel, useCompareState } from "@/lib/useComparison";

export function CompareButton({ model, labeled }: { model: ModelResult; labeled?: boolean }) {
  const state = useCompareState(model.url);
  const added = state === "added";
  const full = state === "full";
  const action = added ? "Remove from comparison" : "Add to comparison";

  if (labeled) {
    return (
      <button
        type="button"
        onClick={() => toggleCompareModel(model)}
        aria-pressed={added}
        disabled={!added && full}
        aria-label={`${action}: ${model.title}`}
        title={!added && full ? `Up to ${COMPARE_LIMIT} models can be compared` : action}
        className={`flex min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden whitespace-nowrap px-2 py-2 text-xs font-medium transition-colors disabled:opacity-40 ${
          added
            ? "bg-spool-accent/15 text-spool-accent-soft"
            : "text-spool-muted hover:bg-spool-chip hover:text-spool-text"
        }`}
      >
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="7" height="14" rx="1" />
          <rect x="14" y="5" width="7" height="14" rx="1" />
        </svg>
        <span className="truncate">{added ? "Comparing" : "Compare"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => toggleCompareModel(model)}
      aria-pressed={added}
      disabled={!added && full}
      aria-label={`${action}: ${model.title}`}
      title={!added && full ? `Up to ${COMPARE_LIMIT} models can be compared` : action}
      className={`flex h-9 w-9 items-center justify-center rounded-xl backdrop-blur-sm disabled:opacity-40 ${
        added ? "bg-spool-accent text-spool-side" : "bg-spool-bg/85 text-spool-text hover:text-spool-accent-soft"
      }`}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="5" width="7" height="14" rx="1" />
        <rect x="14" y="5" width="7" height="14" rx="1" />
      </svg>
    </button>
  );
}

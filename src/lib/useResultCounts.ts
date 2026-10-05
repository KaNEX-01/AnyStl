"use client";

import { useSyncExternalStore } from "react";
import { Platform } from "./types";

// Per-site progress of the current search, published by the search page and
// shown next to each site in the sidebar filter: a count once the site
// answered, a pulse while it's still loading, a mark if it failed.
export type SourceState = "pending" | "ok" | "empty" | "failed";

export interface SearchProgress {
  counts: Partial<Record<Platform, number>>;
  states: Partial<Record<Platform, SourceState>>;
  errors: Partial<Record<Platform, string>>;
}

let progress: SearchProgress | null = null;
const listeners = new Set<() => void>();

export function setSearchProgress(next: SearchProgress | null) {
  progress = next;
  listeners.forEach((l) => l());
}

export function useSearchProgress(): SearchProgress | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => progress,
    () => null,
  );
}

"use client";

import { useSyncExternalStore } from "react";
import { ModelResult } from "./types";

// Which model the quick-preview dialog shows; any card on any page can open it.
let current: ModelResult | null = null;
const listeners = new Set<() => void>();

export function openPreview(model: ModelResult | null) {
  current = model;
  listeners.forEach((l) => l());
}

export function usePreview(): ModelResult | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}

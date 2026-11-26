"use client";

import { useSyncExternalStore } from "react";
import { COMPARE_LIMIT, toggleComparison } from "./comparison";
import type { ModelResult } from "./types";

const EMPTY: ModelResult[] = [];
let selected = EMPTY;
const listeners = new Set<() => void>();

function setComparison(next: ModelResult[]) {
  if (next === selected) return;
  selected = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function toggleCompareModel(model: ModelResult) {
  setComparison(toggleComparison(selected, model));
}

export function clearComparison() {
  setComparison(EMPTY);
}

export function useComparison() {
  return useSyncExternalStore(subscribe, () => selected, () => EMPTY);
}

/** Individual cards only update when their own selection state (or the cap) changes. */
export function useCompareState(url: string) {
  return useSyncExternalStore(subscribe, () => selected.some((model) => model.url === url)
    ? "added" : selected.length >= COMPARE_LIMIT ? "full" : "available", () => "available");
}

"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ModelDetails, ModelResult } from "./types";

// Details fetched for the quick preview, kept for the session so cards can
// show license / file-type badges for models already looked at.
const details = new Map<string, ModelDetails>();
const inFlight = new Map<string, Promise<ModelDetails>>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function fetchDetails(model: ModelResult): Promise<ModelDetails> {
  const known = details.get(model.url);
  if (known) return Promise.resolve(known);
  let pending = inFlight.get(model.url);
  if (!pending) {
    const params = new URLSearchParams({ url: model.url, platform: model.platform });
    pending = fetch(`/api/details?${params}`)
      .then((r) => r.json() as Promise<ModelDetails>)
      .catch((err) => ({ url: model.url, images: [], formats: [], error: String(err) }))
      .then((d) => {
        details.set(model.url, d);
        inFlight.delete(model.url);
        notify();
        return d;
      });
    inFlight.set(model.url, pending);
  }
  return pending;
}

/** Details for `model` once known; `load` starts fetching them. */
export function useDetails(model: ModelResult | null, load = false): ModelDetails | undefined {
  useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => {
    if (model && load) fetchDetails(model);
  }, [model, load]);
  return model ? details.get(model.url) : undefined;
}

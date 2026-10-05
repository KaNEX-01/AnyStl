"use client";

import { useMemo, useSyncExternalStore } from "react";
import { PLATFORM_ORDER } from "./platforms";
import { Platform } from "./types";

// Stores the *disabled* sites, so sites added in future versions start enabled.
const STORAGE_KEY = "anystl-disabled-sources";
const CHANGE_EVENT = "anystl-sources-change";
const NONE: Platform[] = [];

let cachedRaw: string | null = null;
let cachedDisabled: Platform[] = NONE;

function readDisabled(): Platform[] {
  if (typeof window === "undefined") return NONE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedDisabled;
    cachedRaw = raw;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedDisabled = Array.isArray(parsed)
      ? PLATFORM_ORDER.filter((p) => parsed.includes(p))
      : NONE;
  } catch {
    cachedRaw = null;
    cachedDisabled = NONE;
  }
  return cachedDisabled;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function writeDisabled(disabled: Platform[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(disabled));
  } catch {
    // Storage unavailable (private mode etc.) — the choice just won't persist.
    cachedRaw = null;
    cachedDisabled = disabled;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Calls `listener` with the new list of enabled sites whenever the selection
 * changes (in this tab or another). Returns an unsubscribe function.
 */
export function onSourcesChanged(listener: (enabled: Platform[]) => void): () => void {
  return subscribe(() => {
    const disabled = readDisabled();
    listener(PLATFORM_ORDER.filter((p) => !disabled.includes(p)));
  });
}

/** Which sites the user wants to search, remembered across visits. */
export function useSourceFilter() {
  const disabled = useSyncExternalStore(subscribe, readDisabled, () => NONE);
  const enabled = useMemo(() => PLATFORM_ORDER.filter((p) => !disabled.includes(p)), [disabled]);

  /**
   * Turns the given sites on or off together (a whole group, or one site).
   * Returns the resulting enabled list.
   */
  const setEnabled = (platforms: Platform[], on: boolean): Platform[] => {
    const next = on
      ? disabled.filter((p) => !platforms.includes(p))
      : [...new Set([...disabled, ...platforms])];
    // Never allow turning everything off; there'd be nothing to search.
    if (next.length >= PLATFORM_ORDER.length) return enabled;
    writeDisabled(next);
    return PLATFORM_ORDER.filter((p) => !next.includes(p));
  };

  return {
    enabled,
    isEnabled: (p: Platform) => !disabled.includes(p),
    allEnabled: disabled.length === 0,
    setEnabled,
    enableAll: (): Platform[] => {
      writeDisabled([]);
      return PLATFORM_ORDER;
    },
  };
}

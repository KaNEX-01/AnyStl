"use client";

import { useSyncExternalStore } from "react";
import { ModelResult } from "./types";

// Models opened on their own site (middle/ctrl-click on a card, or "Open on…"
// in the preview), newest first. Kept in this browser only, like search history.
const STORAGE_KEY = "anystl-viewed";
const MAX_VIEWED = 500;
const VIEWED_EVENT = "anystl-viewed-change";

export interface ViewedModel extends ModelResult {
  viewedAt: number;
}

const EMPTY: ViewedModel[] = [];
let cachedRaw: string | null = null;
let cachedList: ViewedModel[] = EMPTY;
let cachedUrls = new Set<string>();

function readViewed(): ViewedModel[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedList;
    cachedRaw = raw;
    const data = raw ? JSON.parse(raw) : [];
    cachedList = Array.isArray(data) ? data : EMPTY;
  } catch {
    cachedRaw = null;
    cachedList = EMPTY;
  }
  cachedUrls = new Set(cachedList.map((m) => m.url));
  return cachedList;
}

function write(list: ViewedModel[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error(err);
  }
  window.dispatchEvent(new Event(VIEWED_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(VIEWED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(VIEWED_EVENT, callback);
  };
}

/** Records that `model` was opened on its site, moving it to the top. */
export function recordViewed(model: ModelResult) {
  // Merged duplicates are a view-time grouping; store the model itself.
  const entry: ViewedModel = { ...model, viewedAt: Date.now() };
  delete entry.alternates;
  const list = readViewed().filter((m) => m.url !== model.url);
  write([entry, ...list].slice(0, MAX_VIEWED));
}

export function clearViewed() {
  write([]);
}

export function useViewed() {
  const viewed = useSyncExternalStore(subscribe, readViewed, () => EMPTY);
  return { viewed, isViewed: (url: string) => cachedUrls.has(url) };
}

"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ModelResult, SavedModel } from "./types";
import type { BulkAction, SavedPatch } from "./savedStore";

// Module-level store so every card on the page shares one copy of the saved
// list and one fetch, instead of each card asking the server separately.
let saved: SavedModel[] = [];
let savedUrls = new Set<string>();
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setSaved(next: SavedModel[]) {
  saved = next;
  savedUrls = new Set(next.map((m) => m.url));
  loaded = true;
  listeners.forEach((l) => l());
}

async function request<T extends { saved: SavedModel[] }>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Saving failed (${res.status})`);
  setSaved(data.saved);
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function load(): Promise<void> {
  loading ??= request("/api/saved").then(() => {}, (err) => {
    loading = null;
    console.error(err);
  });
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function toggleSaved(model: ModelResult): Promise<void> {
  if (savedUrls.has(model.url)) {
    await request(`/api/saved?url=${encodeURIComponent(model.url)}`, { method: "DELETE" });
  } else {
    await request("/api/saved", json("POST", model));
  }
}

export async function updateSaved(url: string, patch: SavedPatch): Promise<void> {
  await request("/api/saved", json("PATCH", { url, ...patch }));
}

/** Renames a collection, or deletes it (the models stay saved) when `to` is null. */
export async function renameCollection(from: string, to: string | null): Promise<void> {
  await request("/api/saved/collections", json("POST", { from, to }));
}

/** Removes several models, or adds them to / takes them out of a collection. */
export async function bulkSaved(urls: string[], change: BulkAction): Promise<void> {
  await request("/api/saved/bulk", json("POST", { urls, ...change }));
}

/** Merges an exported JSON file into the saved list. */
export async function importSaved(data: unknown): Promise<{ added: number; skipped: number }> {
  return request<{ saved: SavedModel[]; added: number; skipped: number }>("/api/saved/import", json("POST", data));
}

export async function checkSavedLinks(): Promise<SavedModel[]> {
  const { saved } = await request("/api/saved/check", { method: "POST" });
  return saved;
}

/** The saved entry for `url`, if any (for the preview's note editor). */
export function getSavedModel(url: string): SavedModel | undefined {
  return saved.find((m) => m.url === url);
}

export function useSaved() {
  useEffect(() => {
    load();
  }, []);

  const state = useSyncExternalStore(
    subscribe,
    () => (loaded ? saved : null),
    () => null,
  );

  return {
    saved: state ?? [],
    loaded: state !== null,
    isSaved: (url: string) => savedUrls.has(url),
  };
}

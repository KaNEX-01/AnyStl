"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "anystl-history";
const MAX_HISTORY = 20;
const HISTORY_EVENT = "anystl-history-change";
const EMPTY: string[] = [];

let cachedSnapshot: string[] = EMPTY;
let cachedRaw: string | null = null;

function readHistory(): string[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedSnapshot;
    cachedRaw = raw;
    cachedSnapshot = raw ? (JSON.parse(raw) as string[]) : EMPTY;
    return cachedSnapshot;
  } catch {
    cachedRaw = null;
    cachedSnapshot = EMPTY;
    return EMPTY;
  }
}

function subscribeHistory(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(HISTORY_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(HISTORY_EVENT, callback);
  };
}

function getHistory(): string[] {
  return readHistory();
}

export function addToHistory(query: string) {
  const history = getHistory();
  const filtered = history.filter((q) => q.toLowerCase() !== query.toLowerCase());
  filtered.unshift(query);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_HISTORY)));
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

interface Props {
  onSelect: (query: string) => void;
  centered?: boolean;
}

/** Recent searches as one-click chips. */
export function SearchHistory({ onSelect, centered }: Props) {
  const history = useSyncExternalStore(subscribeHistory, readHistory, () => EMPTY);

  if (history.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${centered ? "justify-center" : ""}`}>
      <span className="mr-1 inline-flex items-center gap-1 font-mono text-[11px] text-spool-dim">
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Recent
      </span>
      {history.slice(0, 6).map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onSelect(q)}
          className="rounded-full bg-spool-chip/80 px-3 py-1 text-xs text-spool-muted transition-colors hover:bg-spool-line hover:text-spool-text"
        >
          {q}
        </button>
      ))}
      <button
        type="button"
        onClick={() => clearHistory()}
        className="px-1.5 text-[11px] text-spool-dim transition-colors hover:text-spool-accent-soft"
      >
        Clear
      </button>
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { LogoLoader } from "./LogoLoader";

interface Props {
  onSearch: (query: string) => void;
  isLoading: boolean;
  initialQuery?: string;
}

export function SearchBar({ onSearch, isLoading, initialQuery }: Props) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [lastInitialQuery, setLastInitialQuery] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (initialQuery !== lastInitialQuery) {
    setLastInitialQuery(initialQuery);
    if (initialQuery !== undefined) setQuery(initialQuery);
  }

  // Press "/" anywhere outside an input or modal to jump straight to search.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) onSearch(trimmed);
  };

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className="flex h-[56px] items-center gap-3 rounded-[16px] border border-spool-line bg-spool-field pl-4 pr-2 transition-colors focus-within:border-spool-accent/70"
    >
      {/* A print nozzle */}
      <svg className="h-[20px] w-[20px] shrink-0 text-spool-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3h6v5l-3 3-3-3V3zM12 11v10" />
      </svg>
      <label htmlFor="search-input" className="sr-only">
        Search 3D models
      </label>
      <input
        ref={inputRef}
        id="search-input"
        type="search"
        value={query}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='Search 3D models, e.g. "benchy", "phone stand", "articulated dragon"'
        className="min-w-0 flex-1 bg-transparent text-[16px] text-spool-text placeholder:text-spool-dim focus:outline-none"
      />
      {!focused && !query && (
        <kbd
          title="Press / to focus search"
          className="hidden shrink-0 rounded-md border border-spool-line bg-spool-card px-2 py-0.5 font-mono text-[11px] text-spool-dim sm:inline-block"
        >
          /
        </kbd>
      )}
      {query && !isLoading && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          title="Clear search"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg text-spool-dim transition-colors hover:bg-spool-chip hover:text-spool-text"
        >
          ×
        </button>
      )}
      <button
        type="submit"
        disabled={isLoading || !query.trim()}
        aria-busy={isLoading}
        // Stays at full strength while searching so the loader reads; only an
        // empty box greys it out.
        className={`flex h-10 shrink-0 items-center gap-2 rounded-xl bg-spool-accent px-5 text-[14px] font-bold text-spool-side transition-colors hover:bg-[#ff8d3a] disabled:cursor-not-allowed ${
          isLoading ? "" : "disabled:opacity-45"
        }`}
      >
        {isLoading && <LogoLoader size={18} color="currentColor" />}
        {isLoading ? "Searching" : "Search"}
      </button>
    </form>
  );
}

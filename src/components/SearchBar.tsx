"use client";

import { useState, FormEvent } from "react";
import { LogoLoader } from "./LogoLoader";

interface Props {
  onSearch: (query: string) => void;
  isLoading: boolean;
  initialQuery?: string;
}

export function SearchBar({ onSearch, isLoading, initialQuery }: Props) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [lastInitialQuery, setLastInitialQuery] = useState(initialQuery);

  if (initialQuery !== lastInitialQuery) {
    setLastInitialQuery(initialQuery);
    if (initialQuery !== undefined) setQuery(initialQuery);
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) onSearch(trimmed);
  };

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className="flex h-[60px] items-center gap-3 rounded-[18px] border border-spool-line bg-spool-field pl-5 pr-2 transition-colors focus-within:border-spool-accent/70"
    >
      {/* A print nozzle */}
      <svg className="h-[22px] w-[22px] shrink-0 text-spool-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3h6v5l-3 3-3-3V3zM12 11v10" />
      </svg>
      <label htmlFor="search-input" className="sr-only">
        Search 3D models
      </label>
      <input
        id="search-input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='Search 3D models, e.g. "benchy", "phone stand", "articulated dragon"'
        className="min-w-0 flex-1 bg-transparent text-[17px] text-spool-text placeholder:text-spool-dim focus:outline-none"
      />
      <button
        type="submit"
        disabled={isLoading || !query.trim()}
        aria-busy={isLoading}
        // Stays at full strength while searching so the loader reads; only an
        // empty box greys it out.
        className={`flex h-11 shrink-0 items-center gap-2 rounded-xl bg-spool-accent px-5 text-[15px] font-bold text-spool-side transition-colors hover:bg-[#ff8d3a] disabled:cursor-not-allowed ${
          isLoading ? "" : "disabled:opacity-45"
        }`}
      >
        {isLoading && <LogoLoader size={20} color="currentColor" />}
        {isLoading ? "Searching" : "Search"}
      </button>
    </form>
  );
}

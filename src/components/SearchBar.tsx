"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { LogoLoader } from "./LogoLoader";

interface Props {
  onSearch: (query: string) => void;
  isLoading: boolean;
  initialQuery?: string;
  variant?: "hero" | "compact";
  placeholder?: string;
}

export function SearchBar({
  onSearch,
  isLoading,
  initialQuery,
  variant = "compact",
  placeholder,
}: Props) {
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
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
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

  const isHero = variant === "hero";

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className={`flex w-full items-center gap-2.5 rounded-full border transition-all ${
        isHero
          ? "h-[58px] border-spool-line bg-spool-field pl-5 pr-2 shadow-[0_14px_38px_-18px_rgba(0,0,0,0.75)] focus-within:border-spool-accent/75 focus-within:ring-2 focus-within:ring-spool-accent/15"
          : "h-[46px] border-spool-line/85 bg-spool-field/90 pl-4 pr-1.5 focus-within:border-spool-accent/75 focus-within:ring-2 focus-within:ring-spool-accent/15"
      }`}
    >
      <svg
        className={`shrink-0 transition-colors ${isHero ? "h-[19px] w-[19px]" : "h-[17px] w-[17px]"} ${
          focused ? "text-spool-accent" : "text-spool-dim"
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
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
        placeholder={placeholder ?? 'Search 3D models — e.g. "benchy", "gridfinity", "phone stand"'}
        className={`min-w-0 flex-1 bg-transparent text-spool-text placeholder:text-spool-dim focus:outline-none ${
          isHero ? "text-[16px]" : "text-[15px]"
        }`}
      />
      {!focused && !query && (
        <kbd
          title="Press / to focus search"
          className="hidden shrink-0 rounded-full border border-spool-line bg-spool-card px-2 py-0.5 font-mono text-[11px] text-spool-dim sm:inline-block"
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
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base text-spool-dim transition-colors hover:bg-spool-chip hover:text-spool-text"
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
        className={`flex shrink-0 items-center gap-2 rounded-full bg-spool-accent font-semibold text-spool-side transition-colors hover:bg-[#ff8d3a] disabled:cursor-not-allowed ${
          isHero ? "h-10 px-5 text-[14px]" : "h-8 px-4 text-[13px]"
        } ${isLoading ? "" : "disabled:opacity-40"}`}
      >
        {isLoading && <LogoLoader size={isHero ? 17 : 15} color="currentColor" />}
        {isLoading ? "Searching" : "Search"}
      </button>
    </form>
  );
}

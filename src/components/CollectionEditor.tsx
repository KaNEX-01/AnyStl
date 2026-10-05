"use client";

import { useState } from "react";

interface Props {
  value: string[];
  /** Every collection in use, offered as suggestions. */
  all: string[];
  onChange: (next: string[]) => void;
}

/** Collection tags for a saved model: remove with ×, add by typing a name. */
export function CollectionEditor({ value, all, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const add = (name: string) => {
    const n = name.trim().slice(0, 40);
    if (n && !value.includes(n)) onChange([...value, n]);
    setDraft("");
  };
  const suggestions = all.filter((c) => !value.includes(c));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-full bg-spool-chip py-1 pl-3 pr-1.5 text-xs text-spool-text">
            {c}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== c))}
              aria-label={`Remove from ${c}`}
              className="flex h-4 w-4 items-center justify-center rounded-full text-spool-muted hover:bg-spool-line hover:text-spool-text"
            >
              ×
            </button>
          </span>
        ))}
        {suggestions.slice(0, 8).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => add(c)}
            className="rounded-full border border-dashed border-spool-line px-3 py-1 text-xs text-spool-muted hover:border-spool-accent hover:text-spool-text"
          >
            + {c}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New collection, e.g. Gifts"
          maxLength={40}
          className="min-w-0 flex-1 rounded-[10px] border border-spool-line bg-spool-field px-3 py-1.5 text-sm text-spool-text placeholder:text-spool-dim focus:border-spool-accent/70 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-[10px] bg-spool-chip px-3 text-sm font-medium text-spool-text hover:bg-spool-line disabled:opacity-40"
        >
          Add
        </button>
      </form>
    </div>
  );
}

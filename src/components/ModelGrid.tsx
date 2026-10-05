"use client";

import { ModelResult } from "@/lib/types";
import { ModelCard } from "./ModelCard";

interface Props {
  models: ModelResult[];
  columns?: number;
  /** Selection mode: clicking a card toggles it instead of opening the preview. */
  selected?: Set<string>;
  onSelect?: (model: ModelResult, index: number, shiftKey: boolean) => void;
}

/** Responsive card grid; `columns` applies from the lg breakpoint up. */
export function ModelGrid({ models, columns = 4, selected, onSelect }: Props) {
  return (
    <div
      className="grid gap-[18px] grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
      style={{ "--cols": columns } as React.CSSProperties}
    >
      {models.map((model, i) => (
        <ModelCard
          key={`${model.platform}-${model.url}-${i}`}
          model={model}
          selected={selected ? selected.has(model.url) : undefined}
          onSelect={onSelect && ((shiftKey) => onSelect(model, i, shiftKey))}
        />
      ))}
    </div>
  );
}

"use client";

interface Props {
  value: number;
  onChange: (v: number) => void;
}

export function ColumnSlider({ value, onChange }: Props) {
  return (
    <label className="flex items-center gap-2.5 text-spool-muted" title="Columns">
      <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
      <span className="sr-only">Columns</span>
      <input
        type="range"
        min={2}
        max={6}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 cursor-pointer accent-spool-accent"
      />
      <span className="w-3 text-center font-mono text-xs tabular-nums">{value}</span>
    </label>
  );
}

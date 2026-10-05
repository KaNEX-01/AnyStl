"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ModelGrid } from "@/components/ModelGrid";
import { PlatformPill } from "@/components/PlatformIcon";
import { PLATFORM_ORDER } from "@/lib/platforms";
import { clearViewed, useViewed, ViewedModel } from "@/lib/useViewed";
import { Platform } from "@/lib/types";

const toolButton =
  "inline-flex h-9 items-center gap-2 rounded-[10px] border border-spool-line bg-spool-field px-3 text-sm text-spool-text transition-colors hover:border-spool-accent disabled:opacity-50";

/** "Today", "Yesterday" or the date, for grouping the history by day. */
function dayLabel(time: number): string {
  const day = new Date(time).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  if (day === today) return "Today";
  if (day === today - 86_400_000) return "Yesterday";
  return new Date(time).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function OpenedPage() {
  const { viewed } = useViewed();
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [text, setText] = useState("");

  const counts = useMemo(() => {
    const c: Partial<Record<Platform, number>> = {};
    for (const m of viewed) c[m.platform] = (c[m.platform] || 0) + 1;
    return c;
  }, [viewed]);

  const days = useMemo(() => {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const groups: Array<{ label: string; models: ViewedModel[] }> = [];
    for (const m of viewed) {
      if (platform && m.platform !== platform) continue;
      if (!words.every((w) => m.title.toLowerCase().includes(w))) continue;
      const label = dayLabel(m.viewedAt);
      if (groups.at(-1)?.label === label) groups.at(-1)!.models.push(m);
      else groups.push({ label, models: [m] });
    }
    return groups;
  }, [viewed, platform, text]);

  const chip = (active: boolean) =>
    `rounded-full transition-opacity ${active ? "ring-2 ring-spool-accent" : "opacity-60 hover:opacity-100"}`;
  const pill = "inline-flex items-center gap-2 rounded-full bg-spool-chip px-3.5 py-1.5 text-sm text-spool-text";

  const onClear = () => {
    if (window.confirm("Clear the list of opened models?")) clearViewed();
  };

  return (
    <main className="flex flex-1 flex-col px-4 pb-12 sm:px-6 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6 pt-7">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-spool-text">Opened models</h1>
          <p className="mt-1 text-[15px] text-spool-muted">
            Models you opened on their site (middle-click, ctrl-click or “Open on…”), newest first. Kept in this browser.
          </p>
        </div>
        {viewed.length > 0 && (
          <button onClick={onClear} className={toolButton}>
            Clear history
          </button>
        )}
      </header>

      {viewed.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setPlatform(null)} className={chip(platform === null)}>
              <span className={pill}>
                All sites <span className="font-mono text-xs text-spool-muted">{viewed.length}</span>
              </span>
            </button>
            {PLATFORM_ORDER.filter((p) => counts[p]).map((p) => (
              <button key={p} onClick={() => setPlatform(p)} className={chip(platform === p)}>
                <PlatformPill platform={p} count={counts[p]} />
              </button>
            ))}
          </div>
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Filter by title"
            className="h-9 w-64 max-w-full rounded-[10px] border border-spool-line bg-spool-field px-3 text-sm text-spool-text placeholder:text-spool-dim focus:border-spool-accent/70 focus:outline-none"
          />
        </div>
      )}

      {viewed.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <p className="mb-2 font-medium text-spool-text">Nothing opened yet</p>
          <p className="max-w-sm text-sm text-spool-muted">
            Middle-click a model in{" "}
            <Link href="/" className="text-spool-accent-soft hover:underline">
              Search
            </Link>{" "}
            or{" "}
            <Link href="/featured" className="text-spool-accent-soft hover:underline">
              Featured
            </Link>{" "}
            to open it in a new tab; it shows up here.
          </p>
        </div>
      ) : days.length === 0 ? (
        <p className="py-16 text-center text-sm text-spool-muted">Nothing opened matches these filters.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {days.map(({ label, models }) => (
            <section key={label}>
              <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-spool-dim">
                {label} · {models.length}
              </h2>
              <ModelGrid models={models} />
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

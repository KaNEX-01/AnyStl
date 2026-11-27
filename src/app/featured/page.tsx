"use client";

import { useCallback, useEffect, useState } from "react";
import { ModelGrid } from "@/components/ModelGrid";
import { SpoolDot } from "@/components/PlatformIcon";
import { LogoLoader } from "@/components/LogoLoader";
import { GROUPS, PLATFORMS } from "@/lib/platforms";
import { useSourceFilter } from "@/lib/useSourceFilter";
import { FeaturedResponse, FeaturedSection } from "@/lib/types";

const PREVIEW_COUNT = 8;

async function fetchFeatured(refresh: boolean): Promise<FeaturedResponse> {
  const res = await fetch(`/api/featured${refresh ? "?refresh=1" : ""}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Failed to load featured models");
  return body;
}

function Section({ section }: { section: FeaturedSection }) {
  const [expanded, setExpanded] = useState(false);
  const info = PLATFORMS[section.platform];
  const shown = expanded ? section.results : section.results.slice(0, PREVIEW_COUNT);

  return (
    <section id={section.platform} className="scroll-mt-24">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SpoolDot platform={section.platform} size={18} />
          <h3 className="text-lg font-semibold text-spool-text">{info.name}</h3>
          <span className="font-mono text-xs text-spool-muted">{info.featuredLabel}</span>
        </div>
        {section.results.length > PREVIEW_COUNT && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-sm font-medium text-spool-accent-soft hover:text-spool-text"
          >
            {expanded ? "Show less" : `Show all ${section.results.length}`}
          </button>
        )}
      </div>

      {section.error ? (
        <p className="rounded-xl border border-[#5B2A2A] bg-[#2A1818] px-4 py-3 text-sm text-[#FCA5A5]">
          Couldn&apos;t load {info.name} right now. ({section.error})
        </p>
      ) : section.results.length === 0 ? (
        <p className="text-sm text-spool-muted">Nothing featured right now.</p>
      ) : (
        <ModelGrid models={shown} />
      )}
    </section>
  );
}

export default function FeaturedPage() {
  const [data, setData] = useState<FeaturedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { enabled } = useSourceFilter();
  const sections = data?.sections.filter((section) => enabled.includes(section.platform));

  const load = useCallback((refresh: boolean) => {
    fetchFeatured(refresh)
      .then(
        (body) => {
          setData(body);
          setError(null);
        },
        (err) => setError(err instanceof Error ? err.message : "Something went wrong"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  return (
    <main className="flex flex-1 flex-col px-4 pb-12 sm:px-6 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-8 pt-7">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-spool-text">Featured</h1>
          <p className="mt-1 text-[15px] text-spool-muted">Trending and hand-picked models from every loaded spool</p>
        </div>
        <div className="flex items-center gap-3">
          {data && !loading && (
            <span className="font-mono text-xs text-spool-dim">
              Updated {new Date(data.fetchedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => {
              setLoading(true);
              load(true);
            }}
            disabled={loading}
            className="rounded-full border border-spool-line-soft bg-spool-card/80 px-4 py-1.5 text-xs font-medium text-spool-text transition-colors hover:border-spool-accent/70 disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              {loading && <LogoLoader size={15} />}
              {loading ? "Loading…" : "Refresh"}
            </span>
          </button>
        </div>
      </header>

      {loading && !data && (
        <div role="status" className="flex flex-col items-center gap-5 py-24 text-sm text-spool-muted">
          <LogoLoader size={88} />
          Collecting featured models from every site…
        </div>
      )}

      {error && <p className="py-10 text-center text-sm text-[#FCA5A5]">{error}</p>}

      {sections?.length === 0 && <p className="text-sm text-spool-muted">Enable a site that supports Featured to see its models.</p>}

      {!!sections?.length && (
        <div className={`space-y-16 transition-opacity ${loading ? "opacity-50" : ""}`}>
          {GROUPS.map((group) => {
            const groupSections = sections.filter((s) => PLATFORMS[s.platform].group === group.id);
            if (groupSections.length === 0) return null;
            return (
              <div key={group.id} id={`group-${group.id}`}>
                <div className="mb-7 border-b border-spool-line-soft pb-3">
                  <h2 className="text-2xl font-bold tracking-tight text-spool-text">{group.name}</h2>
                  <p className="text-sm text-spool-muted">{group.description}</p>
                </div>
                <div className="space-y-12">
                  {groupSections.map((section) => (
                    <Section key={section.platform} section={section} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

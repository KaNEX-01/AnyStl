"use client";

import { useCallback, useEffect, useState } from "react";
import { LogoLoader } from "@/components/LogoLoader";
import { SpoolDot } from "@/components/PlatformIcon";
import { GROUPS, PLATFORMS } from "@/lib/platforms";
import { useSearchPlatforms } from "@/lib/useSourceFilter";
import { HealthCheckEvent, Platform, SiteCheck, SiteHealth } from "@/lib/types";

const toolButton =
  "inline-flex h-9 items-center gap-2 rounded-full border border-spool-line-soft bg-spool-card/80 px-4 text-xs font-medium text-spool-text transition-colors hover:border-spool-accent/70 disabled:opacity-50";

type Verdict = "ok" | "warn" | "failed" | "blocked" | "unknown";

const VERDICT: Record<Verdict, { label: string; dot: string; text: string }> = {
  ok: { label: "Working", dot: "bg-[#4ADE80]", text: "text-[#86EFAC]" },
  warn: { label: "Check scraper", dot: "bg-[#FACC15]", text: "text-[#FDE68A]" },
  failed: { label: "Failing", dot: "bg-[#F87171]", text: "text-[#FCA5A5]" },
  blocked: { label: "Skipped", dot: "bg-[#F87171]", text: "text-[#FCA5A5]" },
  unknown: { label: "Not used yet", dot: "bg-spool-line", text: "text-spool-dim" },
};

function verdict(site: SiteHealth | undefined, now: number): Verdict {
  if (!site) return "unknown";
  if (site.blockedUntil && site.blockedUntil > now) return "blocked";
  const last = site.recent[0];
  if (!last) return "unknown";
  if (last.status === "failed") return "failed";
  // A health check searches a word every site has; nothing back means a broken scraper.
  if (last.warnings?.length || (last.kind === "check" && last.status === "empty")) return "warn";
  return "ok";
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;

function ago(time: number, now: number): string {
  const s = Math.max(0, Math.round((now - time) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

function lastResult(check: SiteCheck): string {
  if (check.status === "failed") return check.error || "failed";
  const what = check.kind === "check" ? "test search" : check.kind;
  if (check.status === "empty") return `${what}: no results`;
  return `${what}: ${check.count} results`;
}

const rowButton =
  "inline-flex h-7 items-center gap-1.5 rounded-full border border-spool-line-soft bg-spool-card/80 px-3 text-xs text-spool-text transition-colors hover:border-spool-accent/70 disabled:opacity-50";

function SiteRow({
  platform,
  site,
  checking,
  disabled,
  now,
  onTest,
  onReset,
}: {
  platform: Platform;
  site?: SiteHealth;
  checking: boolean;
  disabled: boolean;
  now: number;
  onTest: (platform: Platform) => void;
  onReset: (platform: Platform) => void;
}) {
  const v = VERDICT[verdict(site, now)];
  const recent = site?.recent || [];
  const answered = recent.filter((c) => c.status !== "failed");
  const typical = median(answered.map((c) => c.ms));
  const last = recent[0];
  const isBlocked = Boolean(site?.blockedUntil && site.blockedUntil > now);

  return (
    <tr className="border-t border-spool-line-soft align-top">
      <td className="py-3 pr-4">
        <span className="flex items-center gap-2 font-medium text-spool-text">
          <SpoolDot platform={platform} size={12} />
          {PLATFORMS[platform].name}
        </span>
      </td>
      <td className="py-3 pr-4">
        <span className={`inline-flex items-center gap-2 whitespace-nowrap text-sm ${v.text}`}>
          {checking ? <LogoLoader size={14} /> : <span className={`h-2.5 w-2.5 rounded-full ${v.dot}`} />}
          {checking ? "Checking…" : v.label}
        </span>
      </td>
      <td className="py-3 pr-4 text-right font-mono text-xs text-spool-muted">
        {recent.length ? `${answered.length}/${recent.length}` : "—"}
      </td>
      <td className="py-3 pr-4 text-right font-mono text-xs text-spool-muted">{typical === null ? "—" : seconds(typical)}</td>
      <td className="py-3 pr-4 text-sm text-spool-muted">
        {isBlocked && site?.blockedUntil && (
          <p className="text-[#FCA5A5]">
            Kept blocking automated searches; skipped until {new Date(site.blockedUntil).toLocaleTimeString("en-US")}.
          </p>
        )}
        {last && (
          <p className="break-words">
            {lastResult(last)} <span className="text-spool-dim">· {seconds(last.ms)} · {ago(last.at, now)}</span>
          </p>
        )}
        {last?.warnings?.map((w) => (
          <p key={w} className="text-[#FDE68A]">
            ⚠ {w}
          </p>
        ))}
      </td>
      <td className="py-3 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1.5">
          {isBlocked && (
            <button type="button" onClick={() => onReset(platform)} disabled={disabled} className={rowButton}>
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={() => onTest(platform)}
            disabled={disabled || checking}
            aria-label={`Test ${PLATFORMS[platform].name}`}
            className={rowButton}
          >
            Test
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function HealthPage() {
  const platforms = useSearchPlatforms();
  const [sites, setSites] = useState<Partial<Record<Platform, SiteHealth>>>({});
  const [checking, setChecking] = useState<Set<Platform>>(new Set());
  const [running, setRunning] = useState(false);
  const [checkError, setCheckError] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(
    () =>
      fetch("/api/health")
        .then((res) => res.json() as Promise<{ sites: SiteHealth[] }>)
        .then((data) => {
          setSites(Object.fromEntries(data.sites.map((s) => [s.platform, s])));
          setNow(Date.now());
        })
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    refresh();
    // Keep "x min ago" and searches made in other tabs current.
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const runCheck = async (target?: Platform) => {
    const targets = target ? [target] : platforms;
    if (!target) setRunning(true);
    setCheckError(false);
    setChecking((prev) => {
      const next = new Set(prev);
      for (const p of targets) next.add(p);
      return next;
    });
    const done = (p: Platform) =>
      setChecking((s) => {
        const next = new Set(s);
        next.delete(p);
        return next;
      });
    try {
      const endpoint = target ? `/api/health/check?platform=${encodeURIComponent(target)}` : "/api/health/check";
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok || !res.body) throw new Error("Health check request failed");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let completed = false;
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line) as HealthCheckEvent;
          if (event.type === "done") {
            completed = true;
            continue;
          }
          if (event.type === "site") {
            setNow(Date.now());
            setSites((s) => {
              const prev = s[event.platform];
              return {
                ...s,
                [event.platform]: {
                  platform: event.platform,
                  blockedUntil: target ? undefined : prev?.blockedUntil,
                  recent: [event.check, ...(prev?.recent || [])],
                },
              };
            });
          }
          done(event.platform);
        }
      }
      if (!completed) throw new Error("Health check stream ended early");
    } catch {
      setCheckError(true);
    } finally {
      setChecking((prev) => {
        const next = new Set(prev);
        for (const p of targets) next.delete(p);
        return next;
      });
      if (!target) setRunning(false);
      refresh();
    }
  };

  const resetCooldown = async (platform: Platform) => {
    try {
      const res = await fetch("/api/health/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { sites: SiteHealth[] };
      setSites(Object.fromEntries(data.sites.map((s) => [s.platform, s])));
      setNow(Date.now());
    } catch {
      // Ignore transient network errors; next poll refreshes state.
    }
  };

  const all = Object.values(sites);
  const problems = all.filter((s) => ["failed", "blocked", "warn"].includes(verdict(s, now))).length;

  return (
    <main className="flex flex-1 flex-col px-4 pb-12 sm:px-6 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6 pt-7">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-spool-text">Site health</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-spool-muted">
            How each site has answered since AnyStl started. <em>Run check</em> runs a test search or catalog check on every available site: a site
            that answers with nothing, or with results missing images or titles, has probably changed its pages and its
            scraper needs fixing.
          </p>
        </div>
        <button onClick={() => runCheck()} disabled={running} className={toolButton}>
          {running && <LogoLoader size={16} />}
          {running && checking.size > 0 ? `Checking ${checking.size} sites…` : running ? "Finishing check…" : "Run check"}
        </button>
      </header>

      {checkError && (
        <p role="alert" className="mb-4 text-sm text-[#FCA5A5]">
          Could not complete the site check. Check the connection to AnyStl and try again.
        </p>
      )}

      {all.length > 0 && (
        <p className="mb-4 text-sm text-spool-muted">
          {problems ? `${problems} site${problems === 1 ? " needs" : "s need"} attention.` : "No problems in the latest results."}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="font-mono text-[11px] uppercase tracking-wide text-spool-dim">
              <th className="pb-2 pr-4 font-normal">Site</th>
              <th className="pb-2 pr-4 font-normal">Status</th>
              <th className="pb-2 pr-4 text-right font-normal" title="Answers / attempts, last 20">Answered</th>
              <th className="pb-2 pr-4 text-right font-normal" title="Median response time">Typical</th>
              <th className="pb-2 pr-4 font-normal">Latest</th>
              <th className="pb-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          {GROUPS.map((g) => (
            <tbody key={g.id}>
              <tr>
                <td colSpan={6} className="pb-1 pt-5 font-mono text-[11px] uppercase tracking-wide text-spool-accent-soft">
                  {g.name}
                </td>
              </tr>
              {platforms.filter((p) => PLATFORMS[p].group === g.id).map((p) => (
                <SiteRow
                  key={p}
                  platform={p}
                  site={sites[p]}
                  checking={checking.has(p)}
                  disabled={running}
                  now={now}
                  onTest={(platform) => runCheck(platform)}
                  onReset={resetCooldown}
                />
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </main>
  );
}

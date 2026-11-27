"use client";

import { useState } from "react";
import {
  disabledPlatformsForPreset,
  SEARCH_PRESET_IDS,
  SEARCH_PRESETS,
  SearchPresetId,
  SLICER_IDS,
  SLICERS,
  SlicerId,
} from "@/lib/settings";
import { setWizardOpen, updateSettings, useSettings } from "@/lib/useSettings";
import { useSourceFilter } from "@/lib/useSourceFilter";

const API_LABELS: Array<{ key: "thingiverse" | "myminifactory" | "cgtrader" | "cults3d" | "traceparts" | "searxng"; name: string; env: string }> = [
  { key: "thingiverse", name: "Thingiverse API", env: "THINGIVERSE_ACCESS_TOKEN" },
  { key: "myminifactory", name: "MyMiniFactory API", env: "MYMINIFACTORY_API_KEY" },
  { key: "cgtrader", name: "CGTrader API", env: "CGTRADER_ACCESS_TOKEN" },
  { key: "cults3d", name: "Cults3D GraphQL API", env: "CULTS3D_USERNAME + CULTS3D_API_KEY" },
  { key: "traceparts", name: "TraceParts Catalog API", env: "TRACEPARTS_*" },
  { key: "searxng", name: "SearXNG Fallback", env: "SEARXNG_URL" },
];

export default function SettingsPage() {
  const { settings, meta, loaded } = useSettings();
  const { available, applyDisabled } = useSourceFilter();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectSlicer = async (slicer: SlicerId) => {
    setBusy(true);
    setStatus(null);
    try {
      await updateSettings({ slicer, onboardingDone: true });
      setStatus(`Slicer updated to ${SLICERS[slicer].name}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save slicer setting.");
    } finally {
      setBusy(false);
    }
  };

  const selectPreset = async (defaultPreset: SearchPresetId) => {
    setBusy(true);
    setStatus(null);
    try {
      applyDisabled(disabledPlatformsForPreset(defaultPreset, available));
      await updateSettings({ defaultPreset, onboardingDone: true });
      setStatus(`Applied "${SEARCH_PRESETS[defaultPreset].name}" site selection.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save preset.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col gap-8 px-4 pb-12 sm:px-6 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-7">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-spool-text">Settings</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-spool-muted">
            Configure your preferred 3D slicer, default search libraries, and view your local AnyStl setup.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-spool-line-soft bg-spool-card/80 px-4 text-xs font-medium text-spool-text transition-colors hover:border-spool-accent/70"
        >
          Run setup wizard
        </button>
      </header>

      {status && (
        <p role="status" className="rounded-xl border border-spool-accent/40 bg-spool-accent/10 px-4 py-2.5 text-sm text-spool-accent-soft">
          {status}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold text-spool-text">Target 3D Slicer</h2>
          <p className="text-sm text-spool-muted">
            Choose which application opens when you click <strong>Send to Slicer</strong> on Printables, Thingiverse, free MyMiniFactory, and Wikimedia Commons models.
          </p>
        </div>
        <div className="grid max-w-3xl grid-cols-1 gap-2.5 sm:grid-cols-2">
          {SLICER_IDS.map((id) => {
            const info = SLICERS[id];
            const active = loaded && settings.slicer === id;
            return (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => selectSlicer(id)}
                aria-pressed={active}
                className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors disabled:opacity-60 ${
                  active
                    ? "border-spool-accent bg-spool-accent/15 text-spool-text"
                    : "border-spool-line bg-spool-card text-spool-muted hover:border-spool-line hover:bg-spool-chip hover:text-spool-text"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-spool-text">{info.name}</span>
                  {active && (
                    <span className="rounded-full bg-spool-accent px-2 py-0.5 font-mono text-[10px] font-bold text-spool-side">
                      Active
                    </span>
                  )}
                </div>
                <span className="text-xs leading-relaxed text-spool-muted">{info.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold text-spool-text">Library Preset</h2>
          <p className="text-sm text-spool-muted">
            Quickly switch which groups of sites are enabled in your sidebar filter.
          </p>
        </div>
        <div className="grid max-w-3xl grid-cols-1 gap-2.5 sm:grid-cols-2">
          {SEARCH_PRESET_IDS.map((id) => {
            const info = SEARCH_PRESETS[id];
            const active = loaded && settings.defaultPreset === id;
            return (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => selectPreset(id)}
                aria-pressed={active}
                className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors disabled:opacity-60 ${
                  active
                    ? "border-spool-accent bg-spool-accent/15 text-spool-text"
                    : "border-spool-line bg-spool-card text-spool-muted hover:border-spool-line hover:bg-spool-chip hover:text-spool-text"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-spool-text">{info.name}</span>
                  {active && (
                    <span className="rounded-full bg-spool-accent px-2 py-0.5 font-mono text-[10px] font-bold text-spool-side">
                      Active
                    </span>
                  )}
                </div>
                <span className="text-xs leading-relaxed text-spool-muted">{info.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex max-w-3xl flex-col gap-3 rounded-2xl border border-spool-line-soft bg-spool-card p-5">
        <h2 className="text-lg font-semibold text-spool-text">Local storage & optional APIs</h2>
        {meta.dataDir && (
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-mono text-[11px] uppercase tracking-wide text-spool-dim">Data folder (saved.json & settings.json)</span>
            <code className="break-all rounded-lg bg-spool-well px-3 py-2 font-mono text-xs text-spool-text">{meta.dataDir}</code>
          </div>
        )}
        {meta.apis && (
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center justify-between text-xs text-spool-muted">
              <span className="font-mono text-[11px] uppercase tracking-wide text-spool-dim">Optional server credentials (.env.local)</span>
              {meta.apis.noBrowser && (
                <span className="rounded-md bg-spool-chip px-2 py-0.5 font-mono text-[11px] text-spool-accent-soft">
                  ANYSTL_NO_BROWSER=1
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {API_LABELS.map((item) => {
                const on = meta.apis![item.key];
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-2 rounded-xl border border-spool-line-soft bg-spool-well/60 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-spool-text">{item.name}</p>
                      <p className="truncate font-mono text-[10px] text-spool-dim">{item.env}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] ${
                        on ? "bg-[#1C3A28] text-[#86EFAC]" : "bg-spool-chip text-spool-dim"
                      }`}
                    >
                      {on ? "Configured" : "Not set"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

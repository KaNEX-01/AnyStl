"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  disabledPlatformsForPreset,
  SEARCH_PRESET_IDS,
  SEARCH_PRESETS,
  SearchPresetId,
  SLICER_IDS,
  SLICERS,
  SlicerId,
} from "@/lib/settings";
import { isEmbeddedOrca } from "@/lib/sendToOrca";
import { setWizardOpen, updateSettings, useSettings } from "@/lib/useSettings";
import { useSourceFilter } from "@/lib/useSourceFilter";
import { LogoMark } from "./LogoMark";

function OnboardingContent({
  initialSlicer,
  initialPreset,
  onDone,
}: {
  initialSlicer: SlicerId;
  initialPreset: SearchPresetId;
  onDone: () => void;
}) {
  const { available, applyDisabled } = useSourceFilter();
  const [slicer, setSlicer] = useState<SlicerId>(initialSlicer);
  const [preset, setPreset] = useState<SearchPresetId>(initialPreset);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      applyDisabled(disabledPlatformsForPreset(preset, available));
      await updateSettings({ onboardingDone: true, slicer, defaultPreset: preset });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateSettings({ onboardingDone: true });
      onDone();
    } catch {
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-spool-line bg-spool-card shadow-2xl">
      <div className="flex items-center gap-3 border-b border-spool-line-soft px-6 py-5">
        <LogoMark size={38} />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold tracking-tight text-spool-text">Welcome to AnyStl</h2>
          <p className="text-sm text-spool-muted">Pick your slicer and favorite model libraries. You can change these anytime in Settings.</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-mono text-xs uppercase tracking-wide text-spool-accent-soft">1. Which 3D slicer do you use?</h3>
            <span className="text-xs text-spool-dim">Used for one-click Send to Slicer</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SLICER_IDS.map((id) => {
              const info = SLICERS[id];
              const active = slicer === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSlicer(id)}
                  aria-pressed={active}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-colors ${
                    active
                      ? "border-spool-accent bg-spool-accent/15 text-spool-text"
                      : "border-spool-line bg-spool-field text-spool-muted hover:border-spool-line hover:bg-spool-chip hover:text-spool-text"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-spool-text">{info.name}</span>
                    {active && (
                      <span className="rounded-full bg-spool-accent px-2 py-0.5 font-mono text-[10px] font-bold text-spool-side">
                        Selected
                      </span>
                    )}
                  </div>
                  <span className="text-xs leading-relaxed text-spool-muted">{info.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-mono text-xs uppercase tracking-wide text-spool-accent-soft">2. What do you search for most?</h3>
            <span className="text-xs text-spool-dim">Pre-selects sidebar sites</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SEARCH_PRESET_IDS.map((id) => {
              const info = SEARCH_PRESETS[id];
              const active = preset === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPreset(id)}
                  aria-pressed={active}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-colors ${
                    active
                      ? "border-spool-accent bg-spool-accent/15 text-spool-text"
                      : "border-spool-line bg-spool-field text-spool-muted hover:border-spool-line hover:bg-spool-chip hover:text-spool-text"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-spool-text">{info.name}</span>
                    {active && (
                      <span className="rounded-full bg-spool-accent px-2 py-0.5 font-mono text-[10px] font-bold text-spool-side">
                        Selected
                      </span>
                    )}
                  </div>
                  <span className="text-xs leading-relaxed text-spool-muted">{info.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        {error && (
          <p role="alert" className="rounded-xl border border-[#FCA5A5]/30 bg-[#3B1515]/50 px-3.5 py-2.5 text-xs text-[#FCA5A5]">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-spool-line-soft bg-spool-well/60 px-6 py-4">
        <button
          type="button"
          onClick={handleSkip}
          disabled={saving}
          className="rounded-xl px-3.5 py-2 text-sm text-spool-muted transition-colors hover:bg-spool-chip hover:text-spool-text disabled:opacity-50"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-spool-accent px-5 text-sm font-bold text-spool-side transition-colors hover:bg-[#ff8d3a] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save & Start Searching"}
        </button>
      </div>
    </div>
  );
}

/** First-run setup dialog that configures the user's preferred slicer and default sites. */
export function OnboardingModal() {
  const pathname = usePathname();
  const { settings, loaded, wizardOpen } = useSettings();
  const embedded = isEmbeddedOrca();

  const autoOpen = loaded && !settings.onboardingDone && pathname === "/" && !embedded;
  const visible = wizardOpen || autoOpen;

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AnyStl first-run setup"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
    >
      <OnboardingContent
        key={`${settings.slicer}-${settings.defaultPreset}-${wizardOpen}`}
        initialSlicer={settings.slicer}
        initialPreset={settings.defaultPreset}
        onDone={() => setWizardOpen(false)}
      />
    </div>
  );
}

"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AppSettings, DEFAULT_SETTINGS, sanitizeSettings } from "./settings";

export interface SettingsMetadata {
  dataDir?: string;
  apis?: {
    thingiverse: boolean;
    myminifactory: boolean;
    cgtrader: boolean;
    cults3d: boolean;
    traceparts: boolean;
    searxng: boolean;
    noBrowser: boolean;
  };
}

interface Snapshot {
  settings: AppSettings;
  meta: SettingsMetadata;
  loaded: boolean;
  wizardOpen: boolean;
}

const initial: Snapshot = {
  settings: { ...DEFAULT_SETTINGS },
  meta: {},
  loaded: false,
  wizardOpen: false,
};

let snapshot: Snapshot = initial;
const listeners = new Set<() => void>();
let fetchStarted = false;

function emit() {
  for (const listener of listeners) listener();
}

function setSnapshot(next: Snapshot) {
  snapshot = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function loadOnce() {
  if (fetchStarted || typeof window === "undefined") return;
  fetchStarted = true;
  fetch("/api/settings")
    .then(async (res) => {
      if (!res.ok) throw new Error("Settings fetch failed");
      return (await res.json()) as Record<string, unknown>;
    })
    .then((data) => {
      setSnapshot({
        settings: sanitizeSettings(data),
        meta: {
          dataDir: typeof data.dataDir === "string" ? data.dataDir : undefined,
          apis: data.apis && typeof data.apis === "object" ? (data.apis as SettingsMetadata["apis"]) : undefined,
        },
        loaded: true,
        wizardOpen: snapshot.wizardOpen,
      });
    })
    .catch(() => {
      setSnapshot({ ...snapshot, loaded: true });
    });
}

export function getCurrentSettings(): AppSettings {
  return snapshot.settings;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const optimistic = sanitizeSettings({ ...snapshot.settings, ...patch });
  setSnapshot({
    ...snapshot,
    settings: optimistic,
    wizardOpen: patch.onboardingDone === true ? false : snapshot.wizardOpen,
  });

  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`Could not save settings (${res.status})`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const saved = sanitizeSettings(data);
  setSnapshot({
    settings: saved,
    meta: {
      dataDir: typeof data.dataDir === "string" ? data.dataDir : snapshot.meta.dataDir,
      apis: data.apis && typeof data.apis === "object" ? (data.apis as SettingsMetadata["apis"]) : snapshot.meta.apis,
    },
    loaded: true,
    wizardOpen: patch.onboardingDone === true ? false : snapshot.wizardOpen,
  });
  return saved;
}

export function setWizardOpen(open: boolean) {
  setSnapshot({ ...snapshot, wizardOpen: open });
}

export function useSettings() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => initial);
  useEffect(() => {
    loadOnce();
  }, []);
  return state;
}

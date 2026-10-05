"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PLATFORMS, SLICER_PLATFORMS } from "@/lib/platforms";
import { openPreview, usePreview } from "@/lib/usePreview";
import { useDetails } from "@/lib/useDetails";
import { getSavedModel, updateSaved, useSaved } from "@/lib/useSaved";
import { recordViewed } from "@/lib/useViewed";
import { ModelResult } from "@/lib/types";
import { PlatformBadge, SpoolDot } from "./PlatformIcon";
import { SaveButton, formatNumber, useBadges } from "./ModelCard";
import { CollectionEditor } from "./CollectionEditor";
import { LogoLoader } from "./LogoLoader";

/** Note and collections of a saved model, saved as you type (debounced). */
function SavedEditor({ url }: { url: string }) {
  const { saved } = useSaved();
  const entry = saved.find((m) => m.url === url);
  const [note, setNote] = useState(entry?.note || "");
  const allCollections = useMemo(
    () => [...new Set(saved.flatMap((m) => m.collections || []))].sort((a, b) => a.localeCompare(b)),
    [saved],
  );

  useEffect(() => {
    if (!entry || note === (entry.note || "")) return;
    const t = setTimeout(() => updateSaved(url, { note }).catch(console.error), 600);
    return () => clearTimeout(t);
  }, [note, entry, url]);

  // Closing the preview mid-typing still keeps the note.
  const latest = useRef(note);
  useEffect(
    () => () => {
      if (latest.current !== (getSavedModel(url)?.note || "")) {
        updateSaved(url, { note: latest.current }).catch(console.error);
      }
    },
    [url],
  );

  if (!entry) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-spool-well p-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-spool-dim">Note</span>
        <textarea
          value={note}
          onChange={(e) => {
            latest.current = e.target.value;
            setNote(e.target.value);
          }}
          rows={2}
          maxLength={2000}
          placeholder="e.g. print at 0.12 mm, PETG"
          className="resize-y rounded-[10px] border border-spool-line bg-spool-field px-3 py-2 text-sm text-spool-text placeholder:text-spool-dim focus:border-spool-accent/70 focus:outline-none"
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-spool-dim">Collections</span>
        <CollectionEditor
          value={entry.collections || []}
          all={allCollections}
          onChange={(collections) => updateSaved(url, { collections }).catch(console.error)}
        />
      </div>
    </div>
  );
}

/** Hands the model's print files to OrcaSlicer (sites that allow downloads without an account). */
function SlicerButton({ model }: { model: ModelResult }) {
  const [state, setState] = useState<{ busy: boolean; message?: string }>({ busy: false });

  const onClick = async () => {
    setState({ busy: true });
    try {
      const params = new URLSearchParams({ url: model.url, platform: model.platform, title: model.title });
      const res = await fetch(`/api/slicer?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.link) throw new Error(data.error || `Failed (${res.status})`);
      window.location.href = data.link;
      setState({ busy: false, message: `Sent ${data.count} file${data.count === 1 ? "" : "s"} to OrcaSlicer.` });
    } catch (err) {
      setState({ busy: false, message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={onClick}
        disabled={state.busy}
        title="Downloads the model's STL / 3MF files straight into OrcaSlicer"
        className="flex h-10 items-center justify-center gap-2 rounded-xl border border-spool-line bg-spool-field px-4 text-sm font-medium text-spool-text transition-colors hover:border-spool-accent disabled:opacity-60"
      >
        {state.busy && <LogoLoader size={16} />}
        {state.busy
          ? // Thingiverse makes everyone sit through an ad countdown first.
            `Getting files${model.platform === "thingiverse" ? " (~20 s)" : ""}…`
          : "Open in OrcaSlicer"}
      </button>
      {state.message && <p className="text-xs text-spool-muted">{state.message}</p>}
    </div>
  );
}

function Preview({ model }: { model: ModelResult }) {
  const details = useDetails(model, true);
  const { license, formats } = useBadges(model);
  const { isSaved } = useSaved();
  const saved = isSaved(model.url);
  const images = useMemo(() => {
    const list = [...(details?.images || [])];
    if (model.thumbnail && !list.length) list.push(model.thumbnail);
    return list;
  }, [details, model.thumbnail]);
  const [shown, setShown] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const image = images.filter((i) => !failed.has(i))[shown] || model.thumbnail;
  const site = PLATFORMS[model.platform].name;

  // Keep what the preview learned on the saved entry, so badges survive restarts.
  useEffect(() => {
    if (!saved || !details || details.error) return;
    const entry = getSavedModel(model.url);
    if (!entry) return;
    const sameFormats = (entry.formats || []).join() === details.formats.join();
    if ((details.license && entry.license !== details.license) || (details.formats.length && !sameFormats)) {
      updateSaved(model.url, { license: details.license, formats: details.formats }).catch(console.error);
    }
  }, [saved, details, model.url]);

  return (
    <div className="grid max-h-[90vh] w-full max-w-5xl grid-cols-1 overflow-y-auto rounded-[24px] bg-spool-card md:grid-cols-[1.2fr_1fr] md:overflow-hidden">
      <div className="flex flex-col gap-2 bg-spool-well p-3 md:max-h-[90vh]">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-spool-bg">
          {image ? (
            <img
              src={image}
              alt={model.title}
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain"
              onError={() => setFailed((f) => new Set(f).add(image))}
            />
          ) : (
            <span className="text-sm text-spool-dim">No image</span>
          )}
          {!details && (
            <span className="absolute bottom-3 right-3">
              <LogoLoader size={22} />
            </span>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images
              .filter((i) => !failed.has(i))
              .map((src, i) => (
                <button
                  key={src}
                  onClick={() => setShown(i)}
                  className={`h-14 w-16 shrink-0 overflow-hidden rounded-lg ring-2 ${i === shown ? "ring-spool-accent" : "ring-transparent opacity-70 hover:opacity-100"}`}
                >
                  <img src={src} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={() => setFailed((f) => new Set(f).add(src))} />
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 p-5 md:max-h-[90vh] md:overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <PlatformBadge platform={model.platform} via={model.via} />
          <button
            onClick={() => openPreview(null)}
            aria-label="Close preview"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xl text-spool-muted hover:bg-spool-chip hover:text-spool-text"
          >
            ×
          </button>
        </div>

        <div>
          <h2 className="text-xl font-bold leading-snug text-spool-text">{model.title}</h2>
          {details?.author && <p className="mt-1 text-sm text-spool-muted">by {details.author}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-spool-muted">
          <span title="Likes">♥ {formatNumber(model.likes)}</span>
          <span title="Downloads">↓ {formatNumber(model.downloads)}</span>
          {model.price && <span className="rounded-md bg-spool-price px-2 py-0.5 text-spool-accent-soft">{model.price}</span>}
          {model.isAI && <span className="rounded-md bg-spool-chip px-2 py-0.5 text-[#D8B4FE]">AI</span>}
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-spool-dim">License</dt>
          <dd className="text-spool-text">{license || (details ? "Not stated" : "…")}</dd>
          <dt className="text-spool-dim">Files</dt>
          <dd className="flex flex-wrap gap-1">
            {formats.length > 0
              ? formats.map((f) => (
                  <span key={f} className="rounded bg-spool-chip px-1.5 py-0.5 font-mono text-[11px] text-spool-text">
                    {f}
                  </span>
                ))
              : <span className="text-spool-text">{details ? "Not listed" : "…"}</span>}
          </dd>
        </dl>

        {details?.error && <p className="text-xs text-spool-dim">{details.error} Open it on {site} for the full details.</p>}
        {details?.description && (
          <p className="line-clamp-6 whitespace-pre-line text-sm leading-relaxed text-spool-muted">{details.description}</p>
        )}

        {model.alternates && model.alternates.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-wide text-spool-dim">Also on</span>
            {model.alternates.map((a) => (
              <a
                key={a.url}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => recordViewed(a)}
                onAuxClick={(e) => e.button === 1 && recordViewed(a)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-spool-text hover:bg-spool-chip"
              >
                <SpoolDot platform={a.platform} size={12} />
                <span className="flex-1 truncate">
                  {PLATFORMS[a.platform].name}
                  {a.via && <span className="text-spool-muted"> · {a.via}</span>}
                </span>
                <span className="font-mono text-xs text-spool-muted">♥ {formatNumber(a.likes)}</span>
                {a.price && <span className="font-mono text-xs text-spool-accent-soft">{a.price}</span>}
              </a>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <a
            href={model.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => recordViewed(model)}
            onAuxClick={(e) => e.button === 1 && recordViewed(model)}
            className="flex h-11 flex-1 items-center justify-center rounded-xl bg-spool-accent px-5 text-[15px] font-bold text-spool-side hover:bg-[#ff8d3a]"
          >
            Open on {model.via || site} ↗
          </a>
          <SaveButton model={model} always />
        </div>

        {SLICER_PLATFORMS.includes(model.platform) && <SlicerButton model={model} />}

        {saved && <SavedEditor key={model.url} url={model.url} />}
      </div>
    </div>
  );
}

/** Quick look at a model without leaving AnyStl; opened by clicking a card. */
export function PreviewModal() {
  const model = usePreview();

  useEffect(() => {
    if (!model) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openPreview(null);
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [model]);

  if (!model) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={model.title}
      onClick={(e) => e.target === e.currentTarget && openPreview(null)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
    >
      <Preview key={model.url} model={model} />
    </div>
  );
}

"use client";

import { useState } from "react";
import { ModelResult, SavedModel } from "@/lib/types";
import { toggleSaved, useSaved } from "@/lib/useSaved";
import { useDetails } from "@/lib/useDetails";
import { openPreview } from "@/lib/usePreview";
import { recordViewed, useViewed } from "@/lib/useViewed";
import { PLATFORMS } from "@/lib/platforms";
import { PlatformBadge, SpoolDot } from "./PlatformIcon";

export function formatNumber(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

export function SaveButton({ model, always }: { model: ModelResult; always?: boolean }) {
  const { isSaved } = useSaved();
  const [busy, setBusy] = useState(false);
  const saved = isSaved(model.url);

  const onClick = async () => {
    setBusy(true);
    try {
      await toggleSaved(model);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save model"}
      title={saved ? "Remove from saved" : "Save model"}
      className={`flex h-9 w-9 items-center justify-center rounded-xl backdrop-blur-sm transition-all disabled:opacity-60 ${
        saved
          ? "bg-spool-accent text-spool-side"
          : `bg-spool-bg/85 text-spool-text hover:text-spool-accent-soft ${
              always ? "" : "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            }`
      }`}
    >
      <svg className="h-4 w-4" fill={saved ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    </button>
  );
}

const CUBE = "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4";

/** License and file-type chips, from the preview's details or the saved entry. */
export function useBadges(model: ModelResult): { license?: string; formats: string[] } {
  const details = useDetails(model);
  const saved = model as SavedModel;
  return {
    license: details?.license || saved.license,
    formats: details?.formats.length ? details.formats : saved.formats || [],
  };
}

interface CardProps {
  model: ModelResult;
  /** Set (true/false) in selection mode. */
  selected?: boolean;
  onSelect?: (shiftKey: boolean) => void;
}

export function ModelCard({ model, selected, onSelect }: CardProps) {
  const selecting = selected !== undefined;
  // Some thumbnails can't be loaded (removed, blocked, no image); show the
  // placeholder instead of a broken-image icon.
  const [imageFailed, setImageFailed] = useState(false);
  const filament = PLATFORMS[model.platform].color;
  const { license, formats } = useBadges(model);
  const saved = model as SavedModel;
  const { isViewed } = useViewed();

  // A plain click opens the quick preview; ctrl/middle-click still opens the
  // site, and those go into the "Opened" history.
  const onClick = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (selecting) {
      e.preventDefault();
      onSelect?.(e.shiftKey);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      recordViewed(model);
      return;
    }
    e.preventDefault();
    openPreview(model);
  };
  const onAuxClick = (e: React.MouseEvent) => {
    if (e.button === 1) recordViewed(model);
  };

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-[20px] bg-spool-card transition-shadow ${
        selected ? "ring-2 ring-spool-accent" : "ring-1 ring-transparent hover:ring-spool-line"
      }`}
    >
      <a
        href={model.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        onAuxClick={onAuxClick}
        className={`flex flex-1 flex-col ${selecting ? "select-none" : ""}`}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-spool-well">
          {model.thumbnail && !imageFailed ? (
            <img
              src={model.thumbnail}
              alt={model.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <svg className="h-14 w-14" fill="none" stroke={filament} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d={CUBE} />
              </svg>
            </div>
          )}

          <div className="absolute left-3 top-3 right-14">
            <PlatformBadge platform={model.platform} via={model.via} />
          </div>

          <div className="absolute bottom-3 left-3 flex gap-1.5">
            {model.isAI && (
              <span className="rounded-md bg-spool-bg/85 px-2 py-0.5 font-mono text-[11px] font-medium text-[#D8B4FE]">AI</span>
            )}
            {isViewed(model.url) && (
              <span className="rounded-md bg-spool-bg/85 px-2 py-0.5 font-mono text-[11px] font-medium text-spool-muted" title="You opened this on its site">
                Opened
              </span>
            )}
            {saved.linkStatus === "dead" && (
              <span className="rounded-md bg-[#3B1515]/90 px-2 py-0.5 font-mono text-[11px] font-medium text-[#FCA5A5]" title="The site says this page no longer exists">
                Removed?
              </span>
            )}
          </div>

          {model.alternates && model.alternates.length > 0 && (
            <span
              className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-spool-bg/85 py-1 pl-1.5 pr-2 font-mono text-[11px] text-spool-text backdrop-blur-sm"
              title={`Also on ${model.alternates.map((a) => a.via || PLATFORMS[a.platform].name).join(", ")}`}
            >
              {model.alternates.slice(0, 3).map((a) => (
                <SpoolDot key={a.url} platform={a.platform} size={10} />
              ))}
              +{model.alternates.length} {model.alternates.length === 1 ? "site" : "sites"}
            </span>
          )}
        </div>

        {/* The filament strip */}
        <div className="h-[5px]" style={{ background: filament }} />

        <div className="flex flex-1 flex-col gap-2.5 px-4 pb-4 pt-3.5">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-spool-text">{model.title}</h3>
          {(license || formats.length > 0) && (
            <div className="flex flex-wrap gap-1 font-mono text-[10.5px]">
              {license && <span className="rounded bg-spool-chip px-1.5 py-0.5 text-spool-accent-soft">{license}</span>}
              {formats.slice(0, 4).map((f) => (
                <span key={f} className="rounded bg-spool-chip px-1.5 py-0.5 text-spool-muted">
                  {f}
                </span>
              ))}
            </div>
          )}
          {saved.note && <p className="line-clamp-2 text-xs italic text-spool-muted">“{saved.note}”</p>}
          <div className="mt-auto flex items-center gap-3 font-mono text-xs text-spool-muted">
            <span title="Likes">♥ {formatNumber(model.likes)}</span>
            <span title="Downloads">↓ {formatNumber(model.downloads)}</span>
            <span className="flex-grow" />
            {model.price && (
              <span
                className={`rounded-md px-2 py-0.5 font-medium ${
                  model.price === "Free" ? "bg-[#1C3A28] text-[#86EFAC]" : "bg-spool-price text-spool-accent-soft"
                }`}
              >
                {model.price}
              </span>
            )}
          </div>
        </div>
      </a>

      {/* Save toggle, outside the link so clicking it doesn't open the model */}
      {selecting ? (
        <span
          className={`pointer-events-none absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-xl text-base font-bold backdrop-blur-sm ${
            selected ? "bg-spool-accent text-spool-side" : "bg-spool-bg/85 text-transparent ring-1 ring-inset ring-spool-line"
          }`}
        >
          <span aria-hidden="true">✓</span>
          <span className="sr-only">{selected ? "Selected" : "Not selected"}</span>
        </span>
      ) : (
        <div className="absolute right-2 top-2">
          <SaveButton model={model} />
        </div>
      )}
    </article>
  );
}

"use client";

import { useState } from "react";
import { COMPARE_LIMIT } from "@/lib/comparison";
import { toModelDimensions } from "@/lib/modelDimensions";
import { PLATFORMS } from "@/lib/platforms";
import { isEmbeddedOrca, resolveSlicerTarget, sendModelToOrca } from "@/lib/sendToOrca";
import { clearComparison, toggleCompareModel, useComparison } from "@/lib/useComparison";
import { useDetails } from "@/lib/useDetails";
import { recordViewed } from "@/lib/useViewed";
import type { ModelResult, SavedModel } from "@/lib/types";
import { ModelDialog } from "./ModelDialog";

const rows = ["Photo", "Source", "Formats", "License", "Price", "Dimensions (W × D × H)", "Link"];
const cell = "border-t border-spool-line px-3 py-2.5 align-top";
const number = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 5 });

function ComparePhoto({ sources }: { sources: string[] }) {
  const [index, setIndex] = useState(0);
  const src = sources[index];
  return (
    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-spool-well text-xs text-spool-muted">
      {src ? (
        // Provider images aren't guaranteed to work through Next's optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" referrerPolicy="no-referrer" className="h-full w-full object-contain" onError={() => setIndex((n) => n + 1)} />
      ) : "No photo"}
    </div>
  );
}

function comparisonMetadata(model: ModelResult, details: ReturnType<typeof useDetails>) {
  const dimensions = toModelDimensions(model.dimensions) ?? toModelDimensions(details?.dimensions);
  return {
    photos: [...new Set([...(details?.images || []), model.thumbnail].filter(Boolean))],
    formats: [...new Set([...(model.formats || []), ...(details?.formats || [])])].join(", "),
    license: model.license || details?.license,
    dimensions: dimensions ? `${[dimensions.width, dimensions.depth, dimensions.height].map((value) => number.format(value)).join(" × ")} mm` : undefined,
  };
}

function CompareSlicerAction({ model }: { model: ModelResult }) {
  const target = resolveSlicerTarget(model);
  const [state, setState] = useState<{ status: "idle" | "busy" | "sent" | "error"; note?: string }>({ status: "idle" });
  if (!target || isEmbeddedOrca()) return null;
  const onClick = async () => {
    setState({ status: "busy" });
    try {
      const result = await sendModelToOrca(model);
      setState(
        result.opened
          ? { status: "sent", note: `Sent ${result.count} file${result.count === 1 ? "" : "s"}` }
          : { status: "error", note: result.error || "Open preview to copy URL" },
      );
    } catch (err) {
      setState({ status: "error", note: err instanceof Error ? err.message : "Failed to send" });
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state.status === "busy"}
      className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-spool-line bg-spool-field px-2.5 py-1 text-xs font-medium text-spool-accent-soft hover:border-spool-accent disabled:opacity-60"
    >
      {state.status === "busy" ? "Sending…" : state.status === "sent" ? `✓ ${state.note}` : state.status === "error" ? state.note : "Send to Slicer"}
    </button>
  );
}

function ComparisonTable({ models, onRemove }: { models: ModelResult[]; onRemove: (model: ModelResult) => void }) {
  // At most three slots; opening the table (not adding picks) loads details.
  const [a, b, c] = models;
  const aDetails = useDetails(a ?? null, (a as SavedModel | undefined)?.linkStatus !== "dead");
  const bDetails = useDetails(b ?? null, (b as SavedModel | undefined)?.linkStatus !== "dead");
  const cDetails = useDetails(c ?? null, (c as SavedModel | undefined)?.linkStatus !== "dead");
  const columns = models.map((model, i) => {
    const details = [aDetails, bDetails, cDetails][i];
    const metadata = comparisonMetadata(model, details);
    const dead = (model as SavedModel).linkStatus === "dead";
    const missing = !details && !dead ? "Loading…" : "Not listed";
    const values = [
      <ComparePhoto key={metadata.photos.join("\n")} sources={metadata.photos} />,
      model.via || PLATFORMS[model.platform].name,
      metadata.formats || missing,
      metadata.license || missing,
      model.price || "Not listed",
      metadata.dimensions || missing,
      <div key="open" className="flex flex-col items-start">
        <a href={model.url} target="_blank" rel="noopener noreferrer" onClick={() => recordViewed(model)}
          className="text-spool-accent-soft hover:underline">Open on {model.via || PLATFORMS[model.platform].name} ↗</a>
        <CompareSlicerAction model={model} />
      </div>,
    ];
    return { model, values };
  });

  return (
    <div className="overflow-x-auto" tabIndex={0} aria-label="Side-by-side model data">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">Side-by-side model data</caption>
        <thead>
          <tr>
            <th scope="col" className="w-28 px-3 pb-3 font-medium text-spool-muted">Model</th>
            {columns.map(({ model }) => (
              <th key={model.url} scope="col" className="w-48 break-words px-3 pb-3 align-top">
                {model.title}
                <button type="button" onClick={() => onRemove(model)} aria-label={`Remove from comparison: ${model.title}`}
                  className="mt-1 block text-xs font-normal text-spool-muted hover:text-spool-text">Remove</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((label, i) => (
            <tr key={label}>
              <th scope="row" className={`${cell} font-medium text-spool-muted`}>{label}</th>
              {columns.map(({ model, values }) => <td key={model.url} className={cell}>{values[i]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A short list that stays selected when you move between Search, Featured and Saved. */
export function ComparisonTray() {
  const models = useComparison();
  const [open, setOpen] = useState(false);
  if (!models.length) return null;

  return (
    <>
      <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-end gap-3 border-t border-spool-line bg-spool-side/95 px-4 py-2 text-sm backdrop-blur-md">
        <span role="status" className="text-spool-muted">{models.length}/{COMPARE_LIMIT} selected{models.length === 1 ? " · Pick one more to compare" : ""}</span>
        <button type="button" onClick={clearComparison} className="text-spool-muted hover:text-spool-text">Clear comparison</button>
        <button type="button" onClick={() => setOpen(true)} disabled={models.length < 2}
          className="rounded-lg bg-spool-accent px-3 py-1.5 font-semibold text-spool-side disabled:opacity-50">Compare ({models.length})</button>
      </div>
      {open && (
        <ModelDialog title="Compare models" onClose={() => setOpen(false)}>
          <p className="mb-3 text-sm text-spool-muted">Published dimensions are shown when available; AnyStl doesn’t measure files here.</p>
          <ComparisonTable models={models} onRemove={(model) => {
            toggleCompareModel(model);
            if (models.length <= 2) setOpen(false);
          }} />
        </ModelDialog>
      )}
    </>
  );
}

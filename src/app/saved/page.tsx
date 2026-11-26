"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlternativesDialog } from "@/components/AlternativesDialog";
import { ModelGrid } from "@/components/ModelGrid";
import { LogoLoader } from "@/components/LogoLoader";
import { PlatformPill } from "@/components/PlatformIcon";
import { SortDropdown } from "@/components/SortDropdown";
import { PLATFORM_ORDER } from "@/lib/platforms";
import { sortResults } from "@/lib/sorting";
import { exportCsv, exportJson } from "@/lib/savedExport";
import { bulkSaved, checkSavedLinks, importSaved, renameCollection, useSaved } from "@/lib/useSaved";
import { ModelResult, Platform, SavedModel, SortOption } from "@/lib/types";

const SAVED_SORTS: SortOption[] = ["newest", "likes-desc", "likes-asc", "downloads-desc", "downloads-asc"];
/** Pseudo-collection for models that aren't in any collection. */
const UNSORTED = "\u0000unsorted";

/** Actions for the models picked in selection mode. */
function SelectionBar({
  selected,
  shown,
  collection,
  allCollections,
  onSelect,
  onDone,
}: {
  selected: SavedModel[];
  shown: SavedModel[];
  /** The collection being viewed, if any. */
  collection: string | null;
  allCollections: string[];
  onSelect: (urls: string[]) => void;
  onDone: () => void;
}) {
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const urls = selected.map((m) => m.url);
  const n = selected.length;
  const models = `${n} model${n === 1 ? "" : "s"}`;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const addTo = () => {
    const name = target.trim();
    if (!name || !n) return;
    run(async () => {
      await bulkSaved(urls, { action: "addCollection", collection: name });
      setTarget("");
    });
  };

  const remove = () => {
    if (!window.confirm(`Remove ${models} from saved?`)) return;
    run(async () => {
      await bulkSaved(urls, { action: "remove" });
      onSelect([]);
    });
  };

  const small = "rounded-md px-2 py-1 text-xs text-spool-muted hover:bg-spool-chip hover:text-spool-text disabled:opacity-40";

  return (
    <div className="sticky top-[118px] z-30 -mx-2 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-spool-line bg-spool-side/95 px-3 py-2.5 backdrop-blur-md lg:top-3">
      <span className="text-sm font-medium text-spool-text">{n} selected</span>
      <button onClick={() => onSelect(shown.map((m) => m.url))} className={small}>
        All {shown.length}
      </button>
      <button onClick={() => onSelect([])} disabled={!n} className={small}>
        None
      </button>
      <span className="mx-1 h-5 w-px bg-spool-line" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addTo();
        }}
        className="flex items-center gap-1.5"
      >
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          list="saved-collections"
          maxLength={40}
          placeholder="Collection"
          className="h-8 w-36 rounded-lg border border-spool-line bg-spool-field px-2.5 text-sm text-spool-text placeholder:text-spool-dim focus:border-spool-accent/70 focus:outline-none"
        />
        <datalist id="saved-collections">
          {allCollections.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <button type="submit" disabled={!n || !target.trim() || busy} className={toolButton.replace("h-9", "h-8")}>
          Add to collection
        </button>
      </form>
      {collection && (
        <button
          onClick={() => run(() => bulkSaved(urls, { action: "removeCollection", collection }))}
          disabled={!n || busy}
          className={toolButton.replace("h-9", "h-8")}
        >
          Take out of “{collection}”
        </button>
      )}
      <button onClick={() => exportJson(selected)} disabled={!n} className={toolButton.replace("h-9", "h-8")}>
        Export JSON
      </button>
      <button onClick={() => exportCsv(selected)} disabled={!n} className={toolButton.replace("h-9", "h-8")}>
        CSV
      </button>
      <button
        onClick={remove}
        disabled={!n || busy}
        className={`${toolButton.replace("h-9", "h-8")} text-[#FCA5A5] hover:border-[#F87171]`}
      >
        Remove
      </button>
      <span className="flex-grow" />
      {busy && <LogoLoader size={16} />}
      <button onClick={onDone} className={small} title="Esc">
        Done
      </button>
    </div>
  );
}

const toolButton =
  "inline-flex h-9 items-center gap-2 rounded-[10px] border border-spool-line bg-spool-field px-3 text-sm text-spool-text transition-colors hover:border-spool-accent disabled:opacity-50";

export default function SavedPage() {
  const { saved, loaded } = useSaved();
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [collection, setCollection] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [deadOnly, setDeadOnly] = useState(false);
  const [busy, setBusy] = useState<"check" | "import" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [alternativeFor, setAlternativeFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  /** Where the last plain click landed, for shift-click ranges. */
  const anchor = useRef<number | null>(null);

  const counts = useMemo(() => {
    const c: Partial<Record<Platform, number>> = {};
    for (const m of saved) c[m.platform] = (c[m.platform] || 0) + 1;
    return c;
  }, [saved]);

  const collections = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of saved) for (const name of m.collections || []) c.set(name, (c.get(name) || 0) + 1);
    return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [saved]);
  const unsortedCount = saved.filter((m) => !m.collections?.length).length;
  const deadModels = useMemo(() => saved.filter((m) => m.linkStatus === "dead"), [saved]);
  const deadCount = deadModels.length;
  const alternativeModel = deadModels.find((m) => m.url === alternativeFor);
  const lastChecked = Math.max(0, ...saved.map((m) => m.checkedAt || 0));

  const shown = useMemo(() => {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const list = saved.filter(
      (m) =>
        (!platform || m.platform === platform) &&
        (!collection ||
          (collection === UNSORTED ? !m.collections?.length : m.collections?.includes(collection))) &&
        (!deadOnly || m.linkStatus === "dead") &&
        words.every((w) => `${m.title} ${m.note || ""}`.toLowerCase().includes(w)),
    );
    return sortResults(list, sortBy);
  }, [saved, platform, collection, deadOnly, text, sortBy]);

  // Picks that were filtered away or removed elsewhere don't count.
  const selectedModels = useMemo(() => shown.filter((m) => selectedUrls.has(m.url)), [shown, selectedUrls]);

  const stopSelecting = () => {
    setSelecting(false);
    setSelectedUrls(new Set());
    anchor.current = null;
  };

  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stopSelecting();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);

  const onSelect = (model: ModelResult, index: number, shiftKey: boolean) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (shiftKey && anchor.current !== null) {
        // Shift-click selects everything between the last click and this one.
        const [from, to] = [Math.min(anchor.current, index), Math.max(anchor.current, index)];
        for (const m of shown.slice(from, to + 1)) next.add(m.url);
      } else if (next.has(model.url)) {
        next.delete(model.url);
      } else {
        next.add(model.url);
      }
      return next;
    });
    if (!shiftKey) anchor.current = index;
  };

  const chip = (active: boolean) =>
    `rounded-full transition-opacity ${active ? "ring-2 ring-spool-accent" : "opacity-60 hover:opacity-100"}`;
  const pill = "inline-flex items-center gap-2 rounded-full bg-spool-chip px-3.5 py-1.5 text-sm text-spool-text";

  const run = async (kind: "check" | "import", fn: () => Promise<string>) => {
    setBusy(kind);
    setMessage(null);
    try {
      setMessage(await fn());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const onImport = (file: File) =>
    run("import", async () => {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error("That file isn't valid JSON. Import reads AnyStl's JSON export.");
      }
      const { added, skipped } = await importSaved(data);
      return `Imported ${added} new model${added === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} unreadable` : ""}.`;
    });

  const onCheck = () =>
    run("check", async () => {
      const checked = await checkSavedLinks();
      const removed = checked.filter((model) => model.linkStatus === "dead").length;
      return removed ? `Found ${removed} removed link${removed === 1 ? "" : "s"}. Choose Find alternatives on a marked model.` : "Links checked.";
    });

  const onRename = async (name: string) => {
    const to = window.prompt(`Rename collection “${name}” to:`, name)?.trim();
    if (!to || to === name) return;
    await renameCollection(name, to);
    setCollection(to);
  };

  const onDeleteCollection = async (name: string) => {
    if (!window.confirm(`Delete collection “${name}”? The models stay saved.`)) return;
    await renameCollection(name, null);
    setCollection(null);
  };

  return (
    <main className="flex flex-1 flex-col px-4 pb-12 sm:px-6 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6 pt-7">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-spool-text">Saved models</h1>
          <p className="mt-1 text-[15px] text-spool-muted">
            Click the bookmark on any model to keep it here; click a saved model to add a note or collections.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saved.length > 0 && (
            <>
              <button onClick={() => exportJson(saved)} className={toolButton} title="Full backup that Import can read back">
                Export JSON
              </button>
              <button onClick={() => exportCsv(saved)} className={toolButton} title="For spreadsheets">
                CSV
              </button>
            </>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={busy !== null} className={toolButton}>
            {busy === "import" && <LogoLoader size={16} />}
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onImport(file);
            }}
          />
          {saved.length > 0 && (
            <button
              onClick={onCheck}
              disabled={busy !== null}
              className={toolButton}
              title={lastChecked ? `Last checked ${new Date(lastChecked).toLocaleString("en-US")}` : "Find models that were taken down"}
            >
              {busy === "check" && <LogoLoader size={16} />}
              {busy === "check" ? "Checking…" : "Check links"}
            </button>
          )}
        </div>
      </header>

      {message && <p className="-mt-2 mb-4 text-sm text-spool-muted">{message}</p>}

      {saved.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          {(collections.length > 0 || unsortedCount < saved.length) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wide text-spool-dim">Collections</span>
              <button onClick={() => setCollection(null)} className={chip(collection === null)}>
                <span className={pill}>All</span>
              </button>
              {collections.map(([name, n]) => (
                <button key={name} onClick={() => setCollection(name)} className={chip(collection === name)}>
                  <span className={pill}>
                    {name} <span className="font-mono text-xs text-spool-muted">{n}</span>
                  </span>
                </button>
              ))}
              {unsortedCount > 0 && (
                <button onClick={() => setCollection(UNSORTED)} className={chip(collection === UNSORTED)}>
                  <span className={`${pill} italic`}>
                    Not in a collection <span className="font-mono text-xs not-italic text-spool-muted">{unsortedCount}</span>
                  </span>
                </button>
              )}
              {collection && collection !== UNSORTED && (
                <span className="flex gap-1 text-xs">
                  <button onClick={() => onRename(collection)} className="rounded-md px-2 py-1 text-spool-muted hover:bg-spool-chip hover:text-spool-text">
                    Rename
                  </button>
                  <button onClick={() => onDeleteCollection(collection)} className="rounded-md px-2 py-1 text-spool-muted hover:bg-spool-chip hover:text-[#FCA5A5]">
                    Delete
                  </button>
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button onClick={() => setPlatform(null)} className={chip(platform === null)}>
              <span className={pill}>
                All sites <span className="font-mono text-xs text-spool-muted">{saved.length}</span>
              </span>
            </button>
            {PLATFORM_ORDER.filter((p) => counts[p]).map((p) => (
              <button key={p} onClick={() => setPlatform(p)} className={chip(platform === p)}>
                <PlatformPill platform={p} count={counts[p]} />
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Filter by title or note"
              className="h-9 w-64 max-w-full rounded-[10px] border border-spool-line bg-spool-field px-3 text-sm text-spool-text placeholder:text-spool-dim focus:border-spool-accent/70 focus:outline-none"
            />
            {deadCount > 0 && (
              <button
                onClick={() => setDeadOnly((v) => !v)}
                aria-pressed={deadOnly}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  deadOnly ? "bg-[#7F1D1D] text-[#FECACA]" : "bg-spool-chip text-[#FCA5A5]"
                }`}
              >
                {deadCount} removed
              </button>
            )}
            <span className="flex-grow" />
            {!selecting && (
              <button onClick={() => setSelecting(true)} className={toolButton} title="Pick several models to move, export or remove">
                Select
              </button>
            )}
            <SortDropdown value={sortBy} onChange={setSortBy} options={SAVED_SORTS} />
          </div>
        </div>
      )}

      {!loaded ? (
        <div role="status" className="flex flex-col items-center gap-4 py-20 text-sm text-spool-muted">
          <LogoLoader size={56} />
          Loading…
        </div>
      ) : saved.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <p className="mb-2 font-medium text-spool-text">No saved models yet</p>
          <p className="max-w-sm text-sm text-spool-muted">
            Hover a model in{" "}
            <Link href="/" className="text-spool-accent-soft hover:underline">
              Search
            </Link>{" "}
            or{" "}
            <Link href="/featured" className="text-spool-accent-soft hover:underline">
              Featured
            </Link>{" "}
            and click the bookmark icon, or import an AnyStl export.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-spool-muted">Nothing saved matches these filters.</p>
      ) : (
        <>
          {selecting && (
            <SelectionBar
              selected={selectedModels}
              shown={shown}
              collection={collection && collection !== UNSORTED ? collection : null}
              allCollections={collections.map(([name]) => name)}
              onSelect={(urls) => setSelectedUrls(new Set(urls))}
              onDone={stopSelecting}
            />
          )}
          <ModelGrid models={shown} selected={selecting ? selectedUrls : undefined} onSelect={selecting ? onSelect : undefined}
            onFindAlternatives={(model) => setAlternativeFor(model.url)} />
        </>
      )}
      {alternativeModel && (
        <AlternativesDialog key={alternativeModel.url} model={alternativeModel} deadUrls={deadModels.map((model) => model.url)}
          onClose={() => setAlternativeFor(null)} />
      )}
    </main>
  );
}
